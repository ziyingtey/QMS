using System.Globalization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using QMS.Api.Hubs;
using QMS.Api.Dtos;
using QMS.Application.Geo;
using QMS.Application.Waiting;
using QMS.Domain.Entities;
using QMS.Domain.Enums;
using QMS.Infrastructure.Bds;
using QMS.Infrastructure.Persistence;

namespace QMS.Api.Services;

public sealed class QmsQueueService(
    QmsDbContext db,
    IHubContext<QueueHub> hubContext,
    IBdsReportingBridge bds,
    CustomerNotificationService notifications,
    IWaitTimeEstimator waitTimeEstimator,
    WaitTimeFeatureBuilder featureBuilder,
    CounterSimulationEstimator simulationEstimator)
{
    // ─────────────────────────────────────────────────────────────────────
    // GET SLOTS (customer booking grid)
    // ─────────────────────────────────────────────────────────────────────

    public async Task<IReadOnlyList<SlotDto>> GetSlotsAsync(
        Guid branchId, Guid serviceTypeId, DateOnly calendarDay, CancellationToken cancellationToken = default)
    {
        var branch = await db.Branches.AsNoTracking().FirstOrDefaultAsync(b => b.Id == branchId, cancellationToken)
                     ?? throw new InvalidOperationException("Branch not found.");
        var service = await db.ServiceTypes.AsNoTracking().FirstOrDefaultAsync(
                          s => s.Id == serviceTypeId && s.BranchId == branchId, cancellationToken)
                      ?? throw new InvalidOperationException("Service not found.");

        var zone = TimeSpan.FromMinutes(branch.ServiceZoneOffsetMinutes);
        var nowAtBranch = DateTimeOffset.UtcNow.ToOffset(zone);
        var todayInBranch = DateOnly.FromDateTime(nowAtBranch.DateTime);

        // Weekly booking window: can only book current week + next week (opens on configured day)
        if (!IsWithinBookingWindow(calendarDay, todayInBranch, branch.NextWeekBookingOpensOnDay))
            return Array.Empty<SlotDto>();

        // Branch closure check
        if (await IsBranchClosedOnAsync(branchId, calendarDay, zone, cancellationToken))
            return Array.Empty<SlotDto>();

        var window = await GetBranchLocalServiceWindowAsync(branchId, calendarDay, zone, cancellationToken);
        if (window is null) return Array.Empty<SlotDto>();

        var (windowStart, windowEnd) = window.Value;
        var slotMinutes = branch.SlotDurationMinutes < 1 ? 30 : branch.SlotDurationMinutes;
        var onlineCap = service.OnlineSlotsPerSlot;
        var hidePastSlotsForToday = calendarDay == todayInBranch;

        var slots = new List<SlotDto>();
        for (var t = windowStart; t < windowEnd; t = t.AddMinutes(slotMinutes))
        {
            var slotStart = t;
            var slotEnd = t.AddMinutes(slotMinutes);

            var onlineUsed = await CountActiveOnlineBookingsForSlotAsync(
                branchId, serviceTypeId, slotStart, slotEnd, null, cancellationToken);

            string status;
            if (hidePastSlotsForToday && slotEnd <= nowAtBranch)
                status = "Past";
            else if (onlineCap <= 0)
                status = "Unavailable"; // manager disabled online booking for this service
            else if (onlineUsed >= onlineCap)
                status = "Full";
            else if (onlineUsed >= (int)(onlineCap * 0.85))
                status = "Limited";
            else
                status = "Available";

            slots.Add(new SlotDto(
                FormatIsoOffset(slotStart),
                FormatIsoOffset(slotEnd),
                onlineUsed,
                onlineCap,
                status));
        }

        return slots;
    }

    // ─────────────────────────────────────────────────────────────────────
    // CREATE BOOKING (online)
    // ─────────────────────────────────────────────────────────────────────

    public async Task<BookingCreatedDto> CreateBookingAsync(
        Guid userId,
        Guid branchId,
        Guid serviceTypeId,
        DateTimeOffset slotStart,
        DateTimeOffset slotEnd,
        CancellationToken cancellationToken = default)
    {
        var branch = await db.Branches.FirstOrDefaultAsync(b => b.Id == branchId, cancellationToken)
                     ?? throw new InvalidOperationException("Branch not found");
        var service = await db.ServiceTypes.FirstOrDefaultAsync(
                          s => s.Id == serviceTypeId && s.BranchId == branchId, cancellationToken)
                      ?? throw new InvalidOperationException("Service not found");

        if (service.OnlineSlotsPerSlot <= 0)
            throw new InvalidOperationException("Online booking is not available for this service.");

        var zone = TimeSpan.FromMinutes(branch.ServiceZoneOffsetMinutes);
        var nowAtBranch = DateTimeOffset.UtcNow.ToOffset(zone);
        if (slotEnd <= nowAtBranch)
            throw new InvalidOperationException("This time slot is no longer available (it is in the past).");

        var slotStartZ = slotStart.ToOffset(zone);
        var slotEndZ = slotEnd.ToOffset(zone);
        var bookingDay = DateOnly.FromDateTime(slotStartZ.DateTime);
        var todayInBranch = DateOnly.FromDateTime(nowAtBranch.DateTime);

        // Weekly booking window check
        if (!IsWithinBookingWindow(bookingDay, todayInBranch, branch.NextWeekBookingOpensOnDay))
            throw new InvalidOperationException("Booking is only available for the current and next week.");

        // Branch closure check
        if (await IsBranchClosedOnAsync(branchId, bookingDay, zone, cancellationToken))
            throw new InvalidOperationException("The branch is closed on this day.");

        var serviceWindow = await GetBranchLocalServiceWindowAsync(branch.Id, bookingDay, zone, cancellationToken);
        if (serviceWindow is null)
            throw new InvalidOperationException("The branch is not open for booking on this day.");
        var (serviceWindowStart, serviceWindowEnd) = serviceWindow.Value;
        if (slotStartZ < serviceWindowStart || slotEndZ > serviceWindowEnd)
            throw new InvalidOperationException("This time slot is outside branch service hours.");

        var onlineUsed = await CountActiveOnlineBookingsForSlotAsync(
            branchId, serviceTypeId, slotStart, slotEnd, null, cancellationToken);
        if (onlineUsed >= service.OnlineSlotsPerSlot)
            throw new InvalidOperationException("Online capacity for this slot is full.");

        var (queue, seq, ticket) = await IssueTicketAsync(branch, service, cancellationToken);

        var booking = new Booking
        {
            Id = Guid.NewGuid(),
            CustomerId = userId,
            BranchId = branchId,
            ServiceTypeId = serviceTypeId,
            SlotStart = slotStart,
            SlotEnd = slotEnd,
            Status = BookingStatus.Confirmed
        };

        var entry = new QueueEntry
        {
            Id = Guid.NewGuid(),
            BranchId = branchId,
            ServiceTypeId = serviceTypeId,
            QueueId = queue.Id,
            TicketNumber = ticket,
            EntryType = QueueEntryType.OnlineBooked,
            State = QueueEntryState.Waiting,
            BookingId = booking.Id,
            EnqueueSequence = seq,
            AssignedSlotStart = slotStart,
            AssignedSlotEnd = slotEnd,
            CheckedIn = false,
            // Online: eligible when slot begins (minus OnlineEarlyCallMinutes, handled at call time)
            QueueEligibleAt = slotStart,
        };

        booking.QueueEntry = entry;
        db.Bookings.Add(booking);
        await db.SaveChangesAsync(cancellationToken);

        await bds.OnTicketIssuedAsync(branch.BranchCode, ticket, entry.CreatedAt, service.Code, cancellationToken);
        await hubContext.Clients.Group(QueueHub.BranchGroup(branchId)).SendAsync("QueueUpdated", branchId, cancellationToken);

        await notifications.NotifyAsync(
            userId,
            NotificationKind.Reminder,
            $"Booking confirmed — ticket {ticket} at {branch.Name}. Please arrive before your slot and check in when you reach the branch.",
            booking.Id,
            ticket,
            branchId,
            cancellationToken);

        return new BookingCreatedDto(booking.Id, ticket, FormatIsoOffset(slotStart), FormatIsoOffset(slotEnd), service.Name);
    }

    // ─────────────────────────────────────────────────────────────────────
    // WALK-IN
    // ─────────────────────────────────────────────────────────────────────

    public async Task<WalkInCreatedDto> WalkInAsync(Guid branchId, Guid serviceTypeId, CancellationToken cancellationToken = default)
    {
        var branch = await db.Branches.FirstOrDefaultAsync(b => b.Id == branchId, cancellationToken)
                     ?? throw new InvalidOperationException("Branch not found");
        var service = await db.ServiceTypes.FirstOrDefaultAsync(
                          s => s.Id == serviceTypeId && s.BranchId == branchId, cancellationToken)
                      ?? throw new InvalidOperationException("Service not found");

        var zone = TimeSpan.FromMinutes(branch.ServiceZoneOffsetMinutes);
        var nowAtBranch = DateTimeOffset.UtcNow.ToOffset(zone);
        var todayLocal = DateOnly.FromDateTime(nowAtBranch.DateTime);
        var todayWindow = await GetBranchLocalServiceWindowAsync(branch.Id, todayLocal, zone, cancellationToken);
        if (todayWindow is null)
            throw new InvalidOperationException("Branch is not open today.");
        var (windowStart, windowEnd) = todayWindow.Value;

        // Walk-in only requires ≥1 active counter that serves this service (no capacity limit)
        var eligibleCounters = await CountActiveLaneCountersAsync(branchId, serviceTypeId, cancellationToken);
        if (eligibleCounters < 1)
            throw new InvalidOperationException("This service is temporarily unavailable — no active counter is serving it.");

        // Assign walk-in to the current time slot (for ordering/grouping purposes only)
        var slotM = branch.SlotDurationMinutes < 1 ? 30 : branch.SlotDurationMinutes;
        var chosenStart = AlignSlot(nowAtBranch, slotM, windowStart);
        if (chosenStart < windowStart) chosenStart = windowStart;
        var chosenEnd = chosenStart.AddMinutes(slotM);

        var (queue, seq, ticket) = await IssueTicketAsync(branch, service, cancellationToken);

        var nowUtc = DateTimeOffset.UtcNow;
        var entry = new QueueEntry
        {
            Id = Guid.NewGuid(),
            BranchId = branchId,
            ServiceTypeId = serviceTypeId,
            QueueId = queue.Id,
            TicketNumber = ticket,
            EntryType = QueueEntryType.WalkIn,
            State = QueueEntryState.Waiting,
            CreatedAt = nowUtc,
            EnqueueSequence = seq,
            AssignedSlotStart = chosenStart,
            AssignedSlotEnd = chosenEnd,
            CheckedIn = true,
            QueueEligibleAt = nowUtc,
        };

        db.QueueEntries.Add(entry);
        await db.SaveChangesAsync(cancellationToken);

        // ML snapshot: walk-in is immediately queue-eligible, capture features now
        try
        {
            var fb = new WaitTimeFeatureBuilder(db);
            var features = await fb.BuildAsync(entry, branch, service, nowUtc, cancellationToken);
            var obs = WaitTimeFeatureBuilder.ToObservation(features, entry, nowUtc);
            db.MlTrainingObservations.Add(obs);
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (Exception)
        {
            // Snapshot failure must never block ticket creation
        }

        await bds.OnTicketIssuedAsync(branch.BranchCode, ticket, entry.CreatedAt, service.Code, cancellationToken);
        await hubContext.Clients.Group(QueueHub.BranchGroup(branchId)).SendAsync("QueueUpdated", branchId, cancellationToken);

        return new WalkInCreatedDto(ticket, chosenStart, chosenEnd);
    }

    // ─────────────────────────────────────────────────────────────────────
    // CHECK-IN (customer arrived at branch)
    // ─────────────────────────────────────────────────────────────────────

    public async Task CheckInAsync(
        Guid userId,
        Guid bookingId,
        double? latitude,
        double? longitude,
        CancellationToken cancellationToken = default)
    {
        var booking = await db.Bookings.Include(b => b.QueueEntry).Include(b => b.Branch)
            .FirstOrDefaultAsync(b => b.Id == bookingId && b.CustomerId == userId, cancellationToken)
            ?? throw new InvalidOperationException("Booking not found");

        if (latitude is not null && longitude is not null)
        {
            var d = GeoDistance.Meters(latitude.Value, longitude.Value, booking.Branch.Latitude, booking.Branch.Longitude);
            if (d > booking.Branch.GeofenceMeters)
                throw new InvalidOperationException($"Check-in location is outside the branch geofence (~{Math.Round(d)}m from branch, max {booking.Branch.GeofenceMeters}m).");
        }

        booking.CheckedInAt = DateTimeOffset.UtcNow;
        booking.Status = BookingStatus.CheckedIn;
        if (booking.QueueEntry is not null)
            booking.QueueEntry.CheckedIn = true;

        await db.SaveChangesAsync(cancellationToken);
        await hubContext.Clients.Group(QueueHub.BranchGroup(booking.BranchId)).SendAsync("QueueUpdated", booking.BranchId, cancellationToken);

        var ticket = booking.QueueEntry?.TicketNumber;
        await notifications.NotifyAsync(
            userId,
            NotificationKind.Reminder,
            ticket is not null
                ? $"You're checked in at {booking.Branch.Name}. We'll call ticket {ticket} when it's your turn."
                : $"You're checked in at {booking.Branch.Name}.",
            booking.Id,
            ticket,
            booking.BranchId,
            cancellationToken);
    }

    // ─────────────────────────────────────────────────────────────────────
    // RESCHEDULE BOOKING
    // ─────────────────────────────────────────────────────────────────────

    public async Task RescheduleBookingAsync(
        Guid userId,
        Guid bookingId,
        DateTimeOffset newSlotStart,
        DateTimeOffset newSlotEnd,
        CancellationToken cancellationToken = default)
    {
        var booking = await db.Bookings.Include(b => b.QueueEntry).Include(b => b.Branch).Include(b => b.ServiceType)
            .FirstOrDefaultAsync(b => b.Id == bookingId && b.CustomerId == userId, cancellationToken)
            ?? throw new InvalidOperationException("Booking not found");

        if (booking.Status is BookingStatus.Cancelled or BookingStatus.Completed)
            throw new InvalidOperationException("This booking cannot be rescheduled.");

        var branch = booking.Branch;
        var service = booking.ServiceType;

        var zone = TimeSpan.FromMinutes(branch.ServiceZoneOffsetMinutes);
        var nowAtBranch = DateTimeOffset.UtcNow.ToOffset(zone);

        if (booking.SlotStart - nowAtBranch < TimeSpan.FromHours(1))
            throw new InvalidOperationException("Rescheduling is only allowed up to 1 hour before the scheduled appointment.");

        if (newSlotEnd <= nowAtBranch)
            throw new InvalidOperationException("This time slot is no longer available (it is in the past).");

        var newSlotStartZ = newSlotStart.ToOffset(zone);
        var newSlotEndZ = newSlotEnd.ToOffset(zone);
        var newBookingDay = DateOnly.FromDateTime(newSlotStartZ.DateTime);
        var newWindow = await GetBranchLocalServiceWindowAsync(booking.BranchId, newBookingDay, zone, cancellationToken);
        if (newWindow is null)
            throw new InvalidOperationException("The branch is not open for booking on the selected day.");
        var (newWindowStart, newWindowEnd) = newWindow.Value;
        if (newSlotStartZ < newWindowStart || newSlotEndZ > newWindowEnd)
            throw new InvalidOperationException("This time slot is outside branch service hours.");

        // Closure check for new date
        if (await IsBranchClosedOnAsync(booking.BranchId, newBookingDay, zone, cancellationToken))
            throw new InvalidOperationException("The branch is closed on the selected day.");

        var onlineUsed = await CountActiveOnlineBookingsForSlotAsync(
            booking.BranchId, booking.ServiceTypeId, newSlotStart, newSlotEnd, bookingId, cancellationToken);
        if (onlineUsed >= service.OnlineSlotsPerSlot)
            throw new InvalidOperationException("Online capacity for the new slot is full.");

        booking.SlotStart = newSlotStart;
        booking.SlotEnd = newSlotEnd;

        if (booking.QueueEntry is { State: QueueEntryState.Waiting } qe)
        {
            var oldSlotStart = qe.AssignedSlotStart;
            var oldSlotEnd = qe.AssignedSlotEnd;
            var oldSeq = qe.EnqueueSequence;
            var zoneR = TimeSpan.FromMinutes(branch.ServiceZoneOffsetMinutes);
            var qid = qe.QueueId ?? service.QueueId
                      ?? throw new InvalidOperationException("Queue missing for reschedule.");
            var newSeq = await AllocateQueueSequenceAsync(qid, booking.BranchId, zoneR, cancellationToken);

            // Record reschedule movement
            db.QueueMovements.Add(new QueueMovement
            {
                Id = Guid.NewGuid(),
                QueueEntryId = qe.Id,
                FromSlotStart = oldSlotStart,
                FromSlotEnd = oldSlotEnd,
                ToSlotStart = newSlotStart,
                ToSlotEnd = newSlotEnd,
                PreviousEnqueueSequence = oldSeq,
                NewEnqueueSequence = newSeq,
                MovedAt = DateTimeOffset.UtcNow,
                Reason = QueueMovementReason.ManualReschedule,
            });

            qe.EnqueueSequence = newSeq;
            qe.AssignedSlotStart = newSlotStart;
            qe.AssignedSlotEnd = newSlotEnd;
            // Reschedule resets current eligibility to new slot start
            // InitialQueueEligibleAt remains unchanged (original booking slot)
            qe.QueueEligibleAt = newSlotStart;
        }

        await db.SaveChangesAsync(cancellationToken);
        await hubContext.Clients.Group(QueueHub.BranchGroup(booking.BranchId)).SendAsync("QueueUpdated", booking.BranchId, cancellationToken);
    }

    // ─────────────────────────────────────────────────────────────────────
    // CANCEL BOOKING
    // ─────────────────────────────────────────────────────────────────────

    public async Task CancelBookingAsync(Guid userId, Guid bookingId, CancellationToken cancellationToken = default)
    {
        var booking = await db.Bookings.Include(b => b.QueueEntry).Include(b => b.Branch)
            .FirstOrDefaultAsync(b => b.Id == bookingId && b.CustomerId == userId, cancellationToken)
            ?? throw new InvalidOperationException("Booking not found");

        var zone = TimeSpan.FromMinutes(booking.Branch.ServiceZoneOffsetMinutes);
        var nowAtBranch = DateTimeOffset.UtcNow.ToOffset(zone);
        if (booking.SlotStart - nowAtBranch < TimeSpan.FromHours(1))
            throw new InvalidOperationException("Cancellation is only allowed up to 1 hour before the scheduled appointment.");

        booking.Status = BookingStatus.Cancelled;
        Guid? releasedServiceTypeId = null;
        if (booking.QueueEntry is not null)
        {
            booking.QueueEntry.State = QueueEntryState.Missed;
            releasedServiceTypeId = booking.QueueEntry.ServiceTypeId;
        }

        await db.SaveChangesAsync(cancellationToken);
        await hubContext.Clients.Group(QueueHub.BranchGroup(booking.BranchId)).SendAsync("QueueUpdated", booking.BranchId, cancellationToken);

        var ticket = booking.QueueEntry?.TicketNumber;
        await notifications.NotifyAsync(
            userId,
            NotificationKind.BookingCancelled,
            $"Your appointment at {booking.Branch.Name} was cancelled.",
            booking.Id,
            ticket,
            booking.BranchId,
            cancellationToken);
    }

    // ─────────────────────────────────────────────────────────────────────
    // GET QUEUE STATUS (customer app — people ahead, ETA)
    // ─────────────────────────────────────────────────────────────────────

    public async Task<QueueStatusDto?> GetQueueStatusAsync(
        Guid branchId,
        string ticketNumber,
        CancellationToken cancellationToken = default)
    {
        var entry = await db.QueueEntries.AsNoTracking()
            .Include(q => q.ServiceType)
            .Include(q => q.Branch)
            .Include(q => q.Counter)
            .FirstOrDefaultAsync(q => q.BranchId == branchId && q.TicketNumber == ticketNumber, cancellationToken);
        if (entry is null) return null;

        var nowUtc = DateTimeOffset.UtcNow;
        var earlyMinutes = entry.Branch.OnlineEarlyCallMinutes;

        // People Ahead: uses same eligibility + priority ordering as Call Next.
        // Find all counters that can serve this ticket's service type.
        var counterServiceIds = await db.Counters.AsNoTracking()
            .Include(c => c.AllowedServices)
            .Where(c => c.BranchId == branchId && c.Mode == CounterMode.Active
                        && c.AllowedServices.Any(a => a.ServiceTypeId == entry.ServiceTypeId))
            .SelectMany(c => c.AllowedServices.Select(a => a.ServiceTypeId))
            .Distinct()
            .ToListAsync(cancellationToken);

        // If no active counter serves this service, show all same-service waiting as ahead
        if (counterServiceIds.Count == 0)
            counterServiceIds = new List<Guid> { entry.ServiceTypeId };

        // Count tickets ahead using Call Next priority rules
        var totalAhead = await CountPeopleAheadAsync(entry, counterServiceIds, nowUtc, earlyMinutes, cancellationToken);

        // ── ETA: ML → Counter Simulation → Formula (shared with Staff/Manager) ──
        double eta;
        var etaNullable = await ResolveDisplayEtaMinutesAsync(
            entry, entry.Branch, entry.ServiceType, earlyMinutes, nowUtc, cancellationToken,
            recordPredictions: true);
        if (etaNullable is { } resolved)
            eta = resolved;
        else
        {
            var activeCounters = await CountActiveLaneCountersAsync(branchId, entry.ServiceTypeId, cancellationToken);
            var avg = entry.ServiceType.DefaultAvgServiceMinutes;
            eta = WaitTimeEstimator.EstimateMinutes(totalAhead, avg, Math.Max(1, activeCounters));
        }

        var currentServing = await db.QueueEntries.AsNoTracking()
            .Where(q => q.BranchId == branchId && q.ServiceTypeId == entry.ServiceTypeId && q.State == QueueEntryState.Serving)
            .OrderBy(q => q.ServingStartedAt)
            .Select(q => q.TicketNumber)
            .FirstOrDefaultAsync(cancellationToken);

        string? nextMsg = null;
        if (entry.State == QueueEntryState.Waiting && totalAhead == 0)
            nextMsg = "You are next";

        return new QueueStatusDto(
            entry.TicketNumber,
            entry.State.ToString(),
            totalAhead,
            double.IsInfinity(eta) ? null : Math.Round(eta, 1),
            entry.ServiceType.Name,
            currentServing,
            nextMsg,
            entry.AssignedSlotStart.HasValue ? FormatIsoOffset(entry.AssignedSlotStart.Value) : null,
            entry.AssignedSlotEnd.HasValue ? FormatIsoOffset(entry.AssignedSlotEnd.Value) : null,
            entry.Counter?.Number,
            entry.ServingEndedAt.HasValue ? FormatIsoOffset(entry.ServingEndedAt.Value) : null);
    }

    /// <summary>
    /// Count tickets ahead of the given entry using Call Next eligibility + priority rules.
    /// This ensures "People Ahead" exactly matches what Call Next would process first.
    /// </summary>
    private async Task<int> CountPeopleAheadAsync(
        QueueEntry myEntry, List<Guid> competingServiceIds,
        DateTimeOffset nowUtc, int earlyCallMinutes,
        CancellationToken ct)
    {
        // Simulate Call Next repeatedly on a snapshot until I would be selected.
        var pool = await db.QueueEntries.AsNoTracking()
            .Where(q => q.BranchId == myEntry.BranchId
                        && competingServiceIds.Contains(q.ServiceTypeId)
                        && q.State == QueueEntryState.Waiting)
            .Where(q =>
                (q.EntryType == QueueEntryType.WalkIn && q.CheckedIn)
                || (q.EntryType == QueueEntryType.OnlineBooked
                    && q.CheckedIn
                    && q.AssignedSlotStart.HasValue
                    && q.AssignedSlotStart.Value.AddMinutes(-earlyCallMinutes) <= nowUtc)
                || q.Id == myEntry.Id)
            .ToListAsync(ct);

        // Ensure my ticket is present even if not yet eligible (show 0 ahead / waiting phase)
        if (pool.All(q => q.Id != myEntry.Id))
            pool.Add(myEntry);

        var remaining = pool.ToList();
        var ahead = 0;
        while (remaining.Count > 0)
        {
            var next = QueueCallNextSelector.SelectLongestWaitQueueHead(remaining, nowUtc);
            if (next is null) break;
            if (next.Id == myEntry.Id) return ahead;
            ahead++;
            remaining.RemoveAll(q => q.Id == next.Id);
            if (ahead > 500) break; // safety
        }

        return ahead;
    }

    private static int GetCallNextPriority(QueueEntry entry, DateTimeOffset nowUtc)
    {
        if (entry.EntryType == QueueEntryType.OnlineBooked && entry.CheckedIn
            && entry.AssignedSlotStart.HasValue && entry.AssignedSlotStart <= nowUtc
            && entry.AssignedSlotEnd.HasValue && entry.AssignedSlotEnd > nowUtc)
            return 0;
        return 1;
    }

    // ─────────────────────────────────────────────────────────────────────
    // CALL NEXT — 档 B multi-queue longest-wait
    // AllowedServices → queues; each queue head = P0 then EnqueueSequence;
    // among heads any P0 beats P1, then earliest QueueEligibleAt (longest wait).
    // ─────────────────────────────────────────────────────────────────────

    public async Task<CallNextDto> CallNextAsync(
        Guid staffId,
        Guid branchId,
        Guid serviceTypeId, // kept for API compat but ignored — we search all counter lanes
        CancellationToken cancellationToken = default)
    {
        var counter = await db.Counters
            .Include(c => c.Branch)
            .Include(c => c.AllowedServices)
            .FirstOrDefaultAsync(
                c => c.BranchId == branchId && c.StaffId == staffId, cancellationToken)
            ?? throw new InvalidOperationException("No counter assigned to this staff user.");

        if (counter.AllowedServices.Count == 0)
            throw new InvalidOperationException("This counter has no allowed service lanes.");

        var allowedServiceIds = counter.AllowedServices.Select(a => a.ServiceTypeId).ToList();
        var zone = TimeSpan.FromMinutes(counter.Branch.ServiceZoneOffsetMinutes);
        var nowUtc = DateTimeOffset.UtcNow;
        var earlyMinutes = counter.Branch.OnlineEarlyCallMinutes;

        var claimed = await FindAndClaimNextTicketAsync(counter, allowedServiceIds, nowUtc, earlyMinutes, cancellationToken);

        if (claimed is null)
            return new CallNextDto(null, null, "No eligible waiting customers.");

        var staff = await db.StaffMembers.AsNoTracking().FirstOrDefaultAsync(u => u.Id == staffId, cancellationToken);
        await bds.OnTicketCalledAsync(
            counter.Branch.BranchCode,
            claimed.TicketNumber,
            counter.Number,
            ToBdsStaff10(staff),
            claimed.CalledAt!.Value,
            cancellationToken);

        await hubContext.Clients.Group(QueueHub.BranchGroup(branchId)).SendAsync("TicketCalled", claimed.TicketNumber, cancellationToken);
        await hubContext.Clients.Group(QueueHub.BranchGroup(branchId)).SendAsync("QueueUpdated", branchId, cancellationToken);

        if (claimed.Booking?.CustomerId is Guid customerId)
        {
            await notifications.NotifyAsync(
                customerId,
                NotificationKind.NextTurn,
                $"It's your turn! Ticket {claimed.TicketNumber} — please proceed to Counter {counter.Number}.",
                claimed.BookingId,
                claimed.TicketNumber,
                branchId,
                cancellationToken);
        }

        return new CallNextDto(claimed.TicketNumber, counter.Number, null);
    }

    /// <summary>
    /// 档 B Call Next: each allowed service maps to a queue; take each queue's head
    /// (P0 before P1, then EnqueueSequence), then pick the head that has waited longest.
    /// Global rule: any P0 head beats all P1 heads.
    /// </summary>
    private async Task<QueueEntry?> FindAndClaimNextTicketAsync(
        Counter counter, List<Guid> allowedServiceIds,
        DateTimeOffset nowUtc, int earlyCallMinutes,
        CancellationToken ct)
    {
        using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.ReadCommitted, ct);

        try
        {
            var eligible = await db.QueueEntries
                .Include(q => q.Booking)
                .Where(q => q.BranchId == counter.BranchId
                            && allowedServiceIds.Contains(q.ServiceTypeId)
                            && q.State == QueueEntryState.Waiting)
                .Where(q =>
                    (q.EntryType == QueueEntryType.WalkIn && q.CheckedIn)
                    || (q.EntryType == QueueEntryType.OnlineBooked
                        && q.CheckedIn
                        && q.AssignedSlotStart.HasValue
                        && q.AssignedSlotStart.Value.AddMinutes(-earlyCallMinutes) <= nowUtc))
                .ToListAsync(ct);

            var next = QueueCallNextSelector.SelectLongestWaitQueueHead(eligible, nowUtc);
            if (next is null)
            {
                await tx.RollbackAsync(ct);
                return null;
            }

            // Re-load tracked entity for update
            var tracked = await db.QueueEntries
                .Include(q => q.Booking)
                .FirstAsync(q => q.Id == next.Id, ct);
            if (tracked.State != QueueEntryState.Waiting)
            {
                await tx.RollbackAsync(ct);
                return null;
            }

            tracked.State = QueueEntryState.Called;
            tracked.CalledAt = nowUtc;
            tracked.CounterId = counter.Id;
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return tracked;
        }
        catch
        {
            await tx.RollbackAsync(ct);
            throw;
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // MARK MISSED (staff: customer called but didn't come)
    // ─────────────────────────────────────────────────────────────────────

    public async Task MarkMissedAsync(Guid staffId, string ticketNumber, CancellationToken cancellationToken = default)
    {
        var counter = await db.Counters.FirstOrDefaultAsync(c => c.StaffId == staffId, cancellationToken)
                      ?? throw new InvalidOperationException("Counter not found for staff.");

        var entry = await db.QueueEntries.Include(q => q.Booking)
            .FirstOrDefaultAsync(
                q => q.BranchId == counter.BranchId && q.TicketNumber == ticketNumber
                     && (q.State == QueueEntryState.Called || q.State == QueueEntryState.Serving),
                cancellationToken)
            ?? throw new InvalidOperationException("Ticket not found or not in Called/Serving state.");

        entry.State = QueueEntryState.Missed;
        entry.CounterId = null;

        if (entry.Booking is not null)
            entry.Booking.Status = BookingStatus.Cancelled;

        await db.SaveChangesAsync(cancellationToken);

        await hubContext.Clients.Group(QueueHub.BranchGroup(counter.BranchId)).SendAsync("QueueUpdated", counter.BranchId, cancellationToken);

        if (entry.Booking?.CustomerId is Guid customerId)
        {
            await notifications.NotifyAsync(
                customerId,
                NotificationKind.Missed,
                $"Ticket {entry.TicketNumber} was missed. Please take a new queue number if you still need service.",
                entry.BookingId,
                entry.TicketNumber,
                entry.BranchId,
                cancellationToken);
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // START SERVICE / END SERVICE
    // ─────────────────────────────────────────────────────────────────────

    public async Task StartServiceAsync(Guid staffId, string ticketNumber, CancellationToken cancellationToken = default)
    {
        var counter = await db.Counters
            .Include(c => c.AllowedServices)
            .FirstOrDefaultAsync(c => c.StaffId == staffId, cancellationToken)
            ?? throw new InvalidOperationException("Counter not found for staff.");

        var entry = await db.QueueEntries.FirstOrDefaultAsync(
                        q => q.BranchId == counter.BranchId && q.TicketNumber == ticketNumber && q.CounterId == counter.Id,
                        cancellationToken)
                    ?? throw new InvalidOperationException("Ticket not found on this counter.");

        if (!CounterCanServeLane(counter, entry.ServiceTypeId))
            throw new InvalidOperationException("This ticket's service lane is not allowed for this counter.");

        entry.State = QueueEntryState.Serving;
        entry.ServingStartedAt = DateTimeOffset.UtcNow;

        // ML target attachment: fill ActualWaitingMinutes on training observations for this ticket
        try
        {
            var observations = await db.MlTrainingObservations
                .Where(o => o.QueueEntryId == entry.Id && o.ActualWaitingMinutes == null)
                .ToListAsync(cancellationToken);
            foreach (var obs in observations)
            {
                obs.ServingStartedAt = entry.ServingStartedAt;
                if (obs.QueueEligibleAt.HasValue)
                    obs.ActualWaitingMinutes = (entry.ServingStartedAt.Value - obs.QueueEligibleAt.Value).TotalMinutes;
            }

            // Also fill WaitPrediction audit records
            var predictions = await db.WaitPredictions
                .Where(p => p.QueueEntryId == entry.Id && p.ActualWaitingMinutes == null)
                .ToListAsync(cancellationToken);
            foreach (var pred in predictions)
            {
                if (entry.QueueEligibleAt.HasValue)
                {
                    pred.ActualWaitingMinutes = (entry.ServingStartedAt.Value - entry.QueueEligibleAt.Value).TotalMinutes;
                    pred.PredictionError = pred.ActualWaitingMinutes - pred.PredictedWaitMinutes;
                }
            }
        }
        catch (Exception)
        {
            // Target attachment failure must never block service start
        }

        await db.SaveChangesAsync(cancellationToken);
        await hubContext.Clients.Group(QueueHub.BranchGroup(counter.BranchId)).SendAsync("QueueUpdated", counter.BranchId, cancellationToken);
    }

    public async Task EndServiceAsync(Guid staffId, string ticketNumber, CancellationToken cancellationToken = default)
    {
        var counter = await db.Counters.FirstOrDefaultAsync(
                          c => c.StaffId == staffId, cancellationToken)
                      ?? throw new InvalidOperationException("Counter not found for staff.");

        var entry = await db.QueueEntries.Include(q => q.Booking).Include(q => q.Branch).Include(q => q.ServiceType).FirstOrDefaultAsync(
                        q => q.BranchId == counter.BranchId && q.TicketNumber == ticketNumber && q.CounterId == counter.Id,
                        cancellationToken)
                    ?? throw new InvalidOperationException("Ticket not found on this counter.");

        if (entry.ServingStartedAt is null)
            throw new InvalidOperationException("Service has not been started for this ticket.");

        var end = DateTimeOffset.UtcNow;
        entry.State = QueueEntryState.Completed;
        entry.ServingEndedAt = end;
        var duration = (int)(end - entry.ServingStartedAt!.Value).TotalSeconds;

        db.ServiceSessionLogs.Add(new ServiceSessionLog
        {
            Id = Guid.NewGuid(),
            ServiceTypeId = entry.ServiceTypeId,
            StaffId = staffId,
            CounterId = counter.Id,
            TicketNumber = ticketNumber,
            StartedAt = entry.ServingStartedAt.Value,
            EndedAt = end,
            DurationSeconds = Math.Max(0, duration)
        });

        if (entry.Booking is not null)
            entry.Booking.Status = BookingStatus.Completed;

        await db.SaveChangesAsync(cancellationToken);

        var staff = await db.StaffMembers.AsNoTracking().FirstOrDefaultAsync(u => u.Id == staffId, cancellationToken);
        await bds.OnTicketCompletedAsync(
            entry.Branch.BranchCode,
            entry.TicketNumber,
            entry.ServiceType.Name,
            counter.Number,
            ToBdsStaff10(staff),
            entry.CreatedAt,
            entry.CalledAt,
            entry.ServingStartedAt!.Value,
            end,
            cancellationToken);

        await hubContext.Clients.Group(QueueHub.BranchGroup(counter.BranchId)).SendAsync("QueueUpdated", counter.BranchId, cancellationToken);

        if (entry.Booking?.CustomerId is Guid customerId)
        {
            await notifications.NotifyAsync(
                customerId,
                NotificationKind.Reminder,
                $"Thank you! Service for ticket {entry.TicketNumber} is complete.",
                entry.BookingId,
                entry.TicketNumber,
                entry.BranchId,
                cancellationToken);
        }
    }
    // ─────────────────────────────────────────────────────────────────────

    public async Task<MyCounterDto> GetMyCounterAsync(Guid staffId, CancellationToken cancellationToken = default)
    {
        var c = await db.Counters
            .AsNoTracking()
            .Include(x => x.Branch)
            .Include(x => x.AllowedServices)
            .ThenInclude(a => a.ServiceType)
            .ThenInclude(s => s.Queue)
            .FirstOrDefaultAsync(x => x.StaffId == staffId, cancellationToken)
            ?? throw new InvalidOperationException("No counter assigned to this staff user.");

        // Work profile = AllowedServices → each service's queue (bank-style listening)
        var ids = c.AllowedServices.Select(a => a.ServiceTypeId).ToList();
        var queueLabels = c.AllowedServices
            .Select(a => a.ServiceType)
            .Where(s => s.Queue != null)
            .Select(s => $"{s.Queue!.TicketPrefix} · {s.Queue.Name}")
            .Distinct()
            .OrderBy(x => x)
            .ToList();
        if (queueLabels.Count == 0 && c.AllowedServices.Count > 0)
        {
            // Queue nav may be null if not included — fall back after load
            var qids = c.AllowedServices.Select(a => a.ServiceType.QueueId).Where(x => x != null).Select(x => x!.Value).Distinct().ToList();
            if (qids.Count > 0)
            {
                var qs = await db.BranchQueues.AsNoTracking().Where(q => qids.Contains(q.Id)).ToListAsync(cancellationToken);
                queueLabels = qs.OrderBy(q => q.TicketPrefix).Select(q => $"{q.TicketPrefix} · {q.Name}").ToList();
            }
        }
        var lane = queueLabels.Count > 0
            ? string.Join(", ", queueLabels)
            : c.AllowedServices.Count == 0
                ? "No queues assigned"
                : string.Join(", ", c.AllowedServices.Select(a => a.ServiceType.Name));
        return new MyCounterDto(c.Number, c.Branch.Name, lane, c.Mode.ToString(), c.BranchId, ids, queueLabels);
    }


    /// <summary>
    /// Shared display ETA: ML (sidecar) → CounterSimulation → Formula.
    /// Same path for customer Track and Staff/Manager queue lists.
    /// </summary>
    private async Task<double?> ResolveDisplayEtaMinutesAsync(
        QueueEntry entry,
        Branch branch,
        ServiceType service,
        int earlyCallMinutes,
        DateTimeOffset nowUtc,
        CancellationToken ct,
        bool recordPredictions = false)
    {
        double simEta = double.PositiveInfinity;
        try
        {
            simEta = await simulationEstimator.EstimateAsync(entry, earlyCallMinutes, nowUtc, ct);
        }
        catch
        {
            /* simulation best-effort */
        }

        double estMin;
        PredictionSource estSource;
        double formulaMin = 0;
        try
        {
            var features = await featureBuilder.BuildAsync(entry, branch, service, nowUtc, ct);
            (estMin, estSource) = waitTimeEstimator.Estimate(features);
            // Raw formula baseline for sanity clamp (IWaitTimeEstimator may be ML wrapper)
            (formulaMin, _) = new FormulaWaitTimeEstimator().Estimate(features);

            if (recordPredictions)
            {
                db.WaitPredictions.Add(new WaitPrediction
                {
                    Id = Guid.NewGuid(),
                    QueueEntryId = entry.Id,
                    PredictedAt = nowUtc,
                    PredictedWaitMinutes = estMin,
                    PredictionSource = (int)estSource,
                    FeatureSchemaVersion = "v4-ml-clamp",
                });
                db.WaitPredictions.Add(new WaitPrediction
                {
                    Id = Guid.NewGuid(),
                    QueueEntryId = entry.Id,
                    PredictedAt = nowUtc,
                    PredictedWaitMinutes = double.IsInfinity(simEta) ? -1 : simEta,
                    PredictionSource = (int)PredictionSource.CounterSimulation,
                    FeatureSchemaVersion = "v4-ml-clamp",
                });
                await db.SaveChangesAsync(ct);
            }
        }
        catch
        {
            if (double.IsInfinity(simEta))
                return null;
            return Math.Round(simEta, 1);
        }

        double eta;
        if (estSource == PredictionSource.Ml)
            eta = ApplyMlSanityClamp(estMin, formulaMin, simEta);
        else if (!double.IsInfinity(simEta))
            eta = simEta;
        else
            eta = estMin;

        if (double.IsInfinity(eta) || eta < 0)
            return null;
        return Math.Round(eta, 1);
    }

    /// <summary>
    /// Keep ML display ETA inside a plausible band vs formula + Call-Next simulation.
    /// Floor: 50% of formula. Ceiling: 150% of simulation (or 2.5× formula if sim unavailable).
    /// WaitPredictions still store the raw ML score for later evaluation.
    /// </summary>
    private static double ApplyMlSanityClamp(double mlMinutes, double formulaMinutes, double simMinutes)
    {
        if (double.IsNaN(mlMinutes) || double.IsInfinity(mlMinutes) || mlMinutes < 0)
            return Math.Max(0, formulaMinutes);

        var lo = Math.Max(0, formulaMinutes * 0.5);
        double hi;
        if (!double.IsInfinity(simMinutes) && !double.IsNaN(simMinutes) && simMinutes >= 0)
            hi = Math.Max(lo, simMinutes * 1.5);
        else
            hi = Math.Max(lo, Math.Max(formulaMinutes * 2.5, mlMinutes));

        return Math.Clamp(mlMinutes, lo, hi);
    }

    public async Task<IReadOnlyList<WaitingTicketDto>> ListWaitingTicketsAsync(
        Guid branchId,
        Guid serviceTypeId,
        CancellationToken cancellationToken = default)
    {
        var active = await CountActiveLaneCountersAsync(branchId, serviceTypeId, cancellationToken);
        var n = Math.Max(1, active);

        var svc = await db.ServiceTypes.AsNoTracking().FirstOrDefaultAsync(
                      s => s.Id == serviceTypeId && s.BranchId == branchId, cancellationToken)
                  ?? throw new InvalidOperationException("Service not found.");

        var branch = await db.Branches.AsNoTracking().FirstAsync(b => b.Id == branchId, cancellationToken);
        var zone = TimeSpan.FromMinutes(branch.ServiceZoneOffsetMinutes);
        var nowAtBranch = DateTimeOffset.UtcNow.ToOffset(zone);
        var todayDate = nowAtBranch.Date;

        var currentlyServing = await db.QueueEntries.AsNoTracking().CountAsync(
            q => q.BranchId == branchId && q.ServiceTypeId == serviceTypeId && q.State == QueueEntryState.Serving,
            cancellationToken);

        var allWaiting = await db.QueueEntries.AsNoTracking()
            .Where(q => q.BranchId == branchId && q.ServiceTypeId == serviceTypeId && q.State == QueueEntryState.Waiting)
            .ToListAsync(cancellationToken);

        // Only show today's entries to staff
        var nowUtc = DateTimeOffset.UtcNow;
        var earlyMin = branch.OnlineEarlyCallMinutes;

        var list = allWaiting
            .Where(q => q.AssignedSlotStart.HasValue && q.AssignedSlotStart.Value.ToOffset(zone).Date == todayDate)
            .ToList();

        // Sort by Call Next order: eligible first (P0 → P1), then not-yet-eligible, then FIFO
        bool IsEligible(QueueEntry q) =>
            (q.EntryType == QueueEntryType.WalkIn && q.CheckedIn)
            || (q.EntryType == QueueEntryType.OnlineBooked
                && q.CheckedIn
                && q.AssignedSlotStart.HasValue
                && q.AssignedSlotStart.Value.AddMinutes(-earlyMin) <= nowUtc);

        list.Sort((a, b) =>
        {
            var aElig = IsEligible(a) ? 0 : 1;
            var bElig = IsEligible(b) ? 0 : 1;
            if (aElig != bElig) return aElig.CompareTo(bElig);

            // Within eligible: P0 before P1
            if (aElig == 0)
            {
                var pa = GetCallNextPriority(a, nowUtc);
                var pb = GetCallNextPriority(b, nowUtc);
                if (pa != pb) return pa.CompareTo(pb);
            }

            // Same priority: FIFO by EnqueueSequence
            return a.EnqueueSequence.CompareTo(b.EnqueueSequence);
        });

        var result = new List<WaitingTicketDto>();
        var position = 1;
        foreach (var q in list)
        {
            double? eta;
            try
            {
                eta = await ResolveDisplayEtaMinutesAsync(q, branch, svc, earlyMin, nowUtc, cancellationToken);
            }
            catch
            {
                var ahead = position - 1;
                var raw = WaitTimeEstimator.EstimateMinutes(ahead + currentlyServing, svc.DefaultAvgServiceMinutes, n);
                eta = double.IsInfinity(raw) ? null : Math.Round(raw, 1);
            }
            result.Add(new WaitingTicketDto(
                q.TicketNumber,
                q.EntryType.ToString(),
                position,
                eta,
                svc.Name,
                q.CheckedIn));
            position++;
        }

        return result;
    }

    /// <summary>
    /// Cross-lane queue: waiting tickets across this counter's allowed services,
    /// ordered like successive Call Next picks (档 B longest-wait queue heads).
    /// </summary>
    public async Task<IReadOnlyList<WaitingTicketDto>> ListCrossLaneWaitingAsync(
        Guid staffId,
        CancellationToken ct = default)
    {
        var counter = await db.Counters.AsNoTracking()
            .Include(c => c.Branch)
            .Include(c => c.AllowedServices)
            .FirstOrDefaultAsync(c => c.StaffId == staffId, ct)
            ?? throw new InvalidOperationException("No counter assigned.");

        var allowedServiceIds = counter.AllowedServices.Select(a => a.ServiceTypeId).ToList();
        if (allowedServiceIds.Count == 0) return Array.Empty<WaitingTicketDto>();

        var branch = counter.Branch;
        var zone = TimeSpan.FromMinutes(branch.ServiceZoneOffsetMinutes);
        var nowUtc = DateTimeOffset.UtcNow;
        var nowLocal = nowUtc.ToOffset(zone);
        var todayDate = nowLocal.Date;
        var earlyMin = branch.OnlineEarlyCallMinutes;

        var services = await db.ServiceTypes.AsNoTracking()
            .Where(s => allowedServiceIds.Contains(s.Id))
            .ToDictionaryAsync(s => s.Id, ct);

        var waiting = await db.QueueEntries.AsNoTracking()
            .Where(q => q.BranchId == branch.Id
                        && allowedServiceIds.Contains(q.ServiceTypeId)
                        && q.State == QueueEntryState.Waiting
                        && q.AssignedSlotStart.HasValue)
            .ToListAsync(ct);

        // Filter today only
        var todayEntries = waiting
            .Where(q => q.AssignedSlotStart!.Value.ToOffset(zone).Date == todayDate)
            .ToList();

        bool IsEligible(QueueEntry q) =>
            (q.EntryType == QueueEntryType.WalkIn && q.CheckedIn)
            || (q.EntryType == QueueEntryType.OnlineBooked
                && q.CheckedIn
                && q.AssignedSlotStart.HasValue
                && q.AssignedSlotStart.Value.AddMinutes(-earlyMin) <= nowUtc);

        // Eligible first in Call Next drain order; not-yet-eligible at the end
        var eligible = todayEntries.Where(IsEligible).ToList();
        var ordered = QueueCallNextSelector.OrderByCallNextDrain(eligible, nowUtc);
        foreach (var leftover in todayEntries.Where(q => !IsEligible(q)).OrderBy(q => q.EnqueueSequence))
            ordered.Add(leftover);

        var result = new List<WaitingTicketDto>();
        for (int i = 0; i < ordered.Count; i++)
        {
            var q = ordered[i];
            var svcName = services.TryGetValue(q.ServiceTypeId, out var svc) ? svc.Name : "Unknown";

            double? eta = null;
            try
            {
                if (services.TryGetValue(q.ServiceTypeId, out var svcForEta))
                    eta = await ResolveDisplayEtaMinutesAsync(q, branch, svcForEta, earlyMin, nowUtc, ct);
            }
            catch { /* best-effort */ }

            result.Add(new WaitingTicketDto(
                q.TicketNumber,
                q.EntryType.ToString(),
                i + 1,
                eta,
                svcName,
                q.CheckedIn));
        }

        return result;
    }

    public async Task<IReadOnlyList<ManagerCounterRowDto>> ListCountersForManagerAsync(
        Guid branchId,
        CancellationToken cancellationToken = default)
    {
        var rows = await db.Counters.AsNoTracking()
            .Include(c => c.AssignedStaff)
            .Include(c => c.AllowedServices)
            .ThenInclude(a => a.ServiceType)
            .ThenInclude(s => s.Queue)
            .Include(c => c.CurrentServiceType)
            .Where(c => c.BranchId == branchId)
            .OrderBy(c => c.Number)
            .ToListAsync(cancellationToken);

        return rows
            .Select(c =>
            {
                var ids = c.AllowedServices.Select(a => a.ServiceTypeId).ToList();
                // Work profile: listened queues (via AllowedServices → ServiceType.Queue)
                var queueLabels = c.AllowedServices
                    .Select(a => a.ServiceType.Queue)
                    .Where(q => q != null)
                    .Select(q => $"{q!.TicketPrefix} · {q.Name}")
                    .Distinct()
                    .OrderBy(x => x)
                    .ToList();
                var display = queueLabels.Count > 0
                    ? string.Join(", ", queueLabels)
                    : c.AllowedServices.Count == 0
                        ? "— (assign queues)"
                        : string.Join(", ", c.AllowedServices.Select(a => a.ServiceType.Name));
                return new ManagerCounterRowDto(
                    c.Id,
                    c.Number,
                    c.Mode.ToString(),
                    c.AssignedStaff?.Email,
                    display,
                    ids,
                    c.CurrentServiceTypeId,
                    c.CurrentServiceType?.Name,
                    queueLabels);
            })
            .ToList();
    }

    public async Task SetCounterModeForManagerAsync(
        Guid branchId, Guid counterId, CounterMode mode, CancellationToken cancellationToken = default)
    {
        var counter = await db.Counters
                          .Include(c => c.AllowedServices)
                          .FirstOrDefaultAsync(c => c.Id == counterId && c.BranchId == branchId, cancellationToken)
                      ?? throw new InvalidOperationException("Counter not found for this branch.");

        if (mode == CounterMode.Active)
        {
            await AssertBranchOpenForCounterOperationsAsync(branchId, cancellationToken);

            if (counter.AllowedServices.Count == 0)
                throw new InvalidOperationException(
                    "Assign at least one allowed lane on this counter before opening (Active).");
        }

        counter.Mode = mode;
        await db.SaveChangesAsync(cancellationToken);
        await hubContext.Clients.Group(QueueHub.BranchGroup(branchId)).SendAsync("CountersUpdated", branchId, cancellationToken);

        // When counter closes or goes on break, capacity drops — broadcast so dashboards refresh
        if (mode == CounterMode.Closed || mode == CounterMode.Break)
        {
            await hubContext.Clients.Group(QueueHub.BranchGroup(branchId)).SendAsync("QueueUpdated", branchId, cancellationToken);
        }
    }

    public async Task SetCounterStaffForManagerAsync(
        Guid branchId, Guid counterId, Guid? staffId, CancellationToken cancellationToken = default)
    {
        var counter = await db.Counters.FirstOrDefaultAsync(
                          c => c.Id == counterId && c.BranchId == branchId, cancellationToken)
                      ?? throw new InvalidOperationException("Counter not found for this branch.");

        if (staffId is null)
        {
            counter.StaffId = null;
        }
        else
        {
            var staffMember = await db.StaffMembers.AsNoTracking().FirstOrDefaultAsync(
                                  s => s.Id == staffId && s.BranchId == branchId, cancellationToken)
                              ?? throw new InvalidOperationException("Staff member not found for this branch.");
            var other = await db.Counters.FirstOrDefaultAsync(
                c => c.BranchId == branchId && c.Id != counterId && c.StaffId == staffId, cancellationToken);
            if (other is not null)
                other.StaffId = null;

            counter.StaffId = staffId;
        }

        await db.SaveChangesAsync(cancellationToken);
        await hubContext.Clients.Group(QueueHub.BranchGroup(branchId)).SendAsync("CountersUpdated", branchId, cancellationToken);
    }

    public async Task SetCounterAllowedServicesForManagerAsync(
        Guid branchId, Guid counterId, IReadOnlyList<Guid> serviceTypeIds, CancellationToken cancellationToken = default)
    {
        var counter = await db.Counters
                          .Include(c => c.AllowedServices)
                          .FirstOrDefaultAsync(c => c.Id == counterId && c.BranchId == branchId, cancellationToken)
                      ?? throw new InvalidOperationException("Counter not found for this branch.");

        var distinct = serviceTypeIds.Distinct().ToList();
        if (distinct.Count == 0)
            throw new InvalidOperationException("Each counter must have at least one allowed lane.");

        foreach (var sid in distinct)
        {
            var exists = await db.ServiceTypes.AnyAsync(s => s.Id == sid && s.BranchId == branchId, cancellationToken);
            if (!exists) throw new InvalidOperationException($"Service type {sid} is not valid for this branch.");
        }

        counter.AllowedServices.Clear();
        foreach (var sid in distinct)
            counter.AllowedServices.Add(new CounterAllowedService { ServiceTypeId = sid });

        await db.SaveChangesAsync(cancellationToken);
        await hubContext.Clients.Group(QueueHub.BranchGroup(branchId)).SendAsync("CountersUpdated", branchId, cancellationToken);
        await hubContext.Clients.Group(QueueHub.BranchGroup(branchId)).SendAsync("QueueUpdated", branchId, cancellationToken);
    }

    public async Task SetCounterDedicatedLaneForManagerAsync(
        Guid branchId, Guid counterId, Guid? dedicatedServiceTypeId, CancellationToken cancellationToken = default)
    {
        var counter = await db.Counters
                          .Include(c => c.AllowedServices)
                          .FirstOrDefaultAsync(c => c.Id == counterId && c.BranchId == branchId, cancellationToken)
                      ?? throw new InvalidOperationException("Counter not found for this branch.");

        if (dedicatedServiceTypeId is { } sid)
        {
            if (counter.AllowedServices.Count == 0)
                throw new InvalidOperationException("Assign at least one allowed lane before setting primary lane.");
            var exists = await db.ServiceTypes.AnyAsync(s => s.Id == sid && s.BranchId == branchId, cancellationToken);
            if (!exists)
                throw new InvalidOperationException("Service type is not valid for this branch.");
            if (counter.AllowedServices.All(a => a.ServiceTypeId != sid))
                throw new InvalidOperationException("That lane is not in this counter's allowed set.");
        }

        counter.CurrentServiceTypeId = dedicatedServiceTypeId;
        await db.SaveChangesAsync(cancellationToken);
        await hubContext.Clients.Group(QueueHub.BranchGroup(branchId)).SendAsync("CountersUpdated", branchId, cancellationToken);
    }

    // ─────────────────────────────────────────────────────────────────────
    // BRANCH OPERATIONAL SETTINGS
    // ─────────────────────────────────────────────────────────────────────

    public async Task<BranchOperationalSettingsDto> GetBranchOperationalSettingsAsync(
        Guid branchId, CancellationToken cancellationToken = default)
    {
        var b = await db.Branches.AsNoTracking().FirstOrDefaultAsync(x => x.Id == branchId, cancellationToken)
                ?? throw new InvalidOperationException("Branch not found.");
        var hours = await db.BranchOperatingHours.AsNoTracking()
            .Where(h => h.BranchId == branchId).ToListAsync(cancellationToken);
        var weekly = hours
            .OrderBy(h => DayOfWeekSortKey(h.DayOfWeek))
            .Select(h => new BranchOperatingHourRow(
                h.DayOfWeek, h.IsClosed,
                h.IsClosed ? null : (int?)h.OpenTime!.Value.TotalMinutes,
                h.IsClosed ? null : (int?)h.CloseTime!.Value.TotalMinutes))
            .ToList();
        return new BranchOperationalSettingsDto(
            b.SlotDurationMinutes,
            b.ServiceZoneOffsetMinutes,
            b.MaxCapacity,
            b.OnlineEarlyCallMinutes,
            b.CalledAbsentGraceMinutes,
            b.NextWeekBookingOpensOnDay,
            weekly);
    }

    public async Task UpdateBranchOperationalSettingsAsync(
        Guid branchId,
        int? slotDurationMinutes,
        IReadOnlyList<BranchOperatingHourRow>? weeklyOperatingHours,
        int? maxSlotTotalCapacity,
        int? onlineEarlyCallMinutes,
        int? calledAbsentGraceMinutes,
        int? nextWeekBookingOpensOnDay,
        bool clearMaxSlotTotalCapacity = false,
        CancellationToken cancellationToken = default)
    {
        var b = await db.Branches.FirstOrDefaultAsync(x => x.Id == branchId, cancellationToken)
                ?? throw new InvalidOperationException("Branch not found.");

        if (slotDurationMinutes is int sd) b.SlotDurationMinutes = Math.Clamp(sd, 5, 180);

        if (clearMaxSlotTotalCapacity) b.MaxCapacity = null;
        else if (maxSlotTotalCapacity is int mx) b.MaxCapacity = Math.Max(1, mx);

        if (onlineEarlyCallMinutes is int oec) b.OnlineEarlyCallMinutes = Math.Clamp(oec, 0, 120);
        if (calledAbsentGraceMinutes is int cag) b.CalledAbsentGraceMinutes = Math.Clamp(cag, 1, 60);
        if (nextWeekBookingOpensOnDay is int nwb) b.NextWeekBookingOpensOnDay = Math.Clamp(nwb, 0, 6);

        if (weeklyOperatingHours is { Count: > 0 })
            await ReplaceBranchWeeklyOperatingHoursAsync(branchId, weeklyOperatingHours, cancellationToken);

        await db.SaveChangesAsync(cancellationToken);
        await hubContext.Clients.Group(QueueHub.BranchGroup(branchId)).SendAsync("QueueUpdated", branchId, cancellationToken);
        await hubContext.Clients.Group(QueueHub.BranchGroup(branchId)).SendAsync("CountersUpdated", branchId, cancellationToken);
    }

    public async Task<IReadOnlyList<AssignableStaffDto>> ListAssignableStaffForBranchAsync(
        Guid branchId, CancellationToken cancellationToken = default)
    {
        var exists = await db.Branches.AsNoTracking().AnyAsync(b => b.Id == branchId, cancellationToken);
        if (!exists) throw new InvalidOperationException("Branch not found.");

        return await db.StaffMembers.AsNoTracking()
            .Where(s => s.BranchId == branchId && (s.Role == StaffRoleKind.Staff || s.Role == StaffRoleKind.Manager))
            .OrderBy(s => s.Email)
            .Select(s => new AssignableStaffDto(s.Id, s.Email, s.Name, s.Role.ToString()))
            .ToListAsync(cancellationToken);
    }

    // ─────────────────────────────────────────────────────────────────────
    // MANAGER WAITING QUEUE + APPOINTMENTS
    // ─────────────────────────────────────────────────────────────────────

    public async Task<IReadOnlyList<ManagerWaitingTicketDto>> ListBranchWaitingQueueForManagerAsync(
        Guid branchId, CancellationToken ct = default)
    {
        var branch = await db.Branches.AsNoTracking().FirstOrDefaultAsync(b => b.Id == branchId, ct)
            ?? throw new InvalidOperationException("Branch not found.");

        var nowUtc = DateTimeOffset.UtcNow;
        var earlyMinutes = branch.OnlineEarlyCallMinutes;

        var waiting = await db.QueueEntries.AsNoTracking()
            .Include(q => q.ServiceType)
            .Where(q => q.BranchId == branchId && q.State == QueueEntryState.Waiting)
            .ToListAsync(ct);

        // Apply Call Next eligibility filter
        var eligible = waiting.Where(q =>
            (q.EntryType == QueueEntryType.WalkIn && q.CheckedIn)
            || (q.EntryType == QueueEntryType.OnlineBooked
                && q.CheckedIn
                && q.AssignedSlotStart.HasValue
                && q.AssignedSlotStart.Value.AddMinutes(-earlyMinutes) <= nowUtc))
            .ToList();

        // Sort by Call Next priority: P0 (checked-in online in active slot) first, then FIFO
        var sorted = eligible
            .OrderBy(q => GetCallNextPriority(q, nowUtc))
            .ThenBy(q => q.EnqueueSequence)
            .ToList();

        var result = new List<ManagerWaitingTicketDto>();
        for (int i = 0; i < sorted.Count; i++)
        {
            var q = sorted[i];
            double? eta = null;
            try
            {
                eta = await ResolveDisplayEtaMinutesAsync(q, branch, q.ServiceType, earlyMinutes, nowUtc, ct);
            }
            catch { /* swallow — ETA is best-effort */ }

            var waitingMin = (nowUtc - q.CreatedAt).TotalMinutes;
            result.Add(new ManagerWaitingTicketDto(
                q.Id, q.TicketNumber, q.ServiceType.Name,
                q.EntryType.ToString(), i + 1,
                q.CreatedAt, q.AssignedSlotStart,
                q.CheckedIn, eta));
        }

        return result;
    }

    public async Task<ManagerAppointmentsTodayDto> GetManagerAppointmentsTodayAsync(
        Guid branchId, CancellationToken ct = default)
    {
        var branch = await db.Branches.AsNoTracking().FirstOrDefaultAsync(b => b.Id == branchId, ct)
            ?? throw new InvalidOperationException("Branch not found.");

        var zone = TimeSpan.FromMinutes(branch.ServiceZoneOffsetMinutes);
        var nowLocal = DateTimeOffset.UtcNow.ToOffset(zone);
        var todayDate = DateOnly.FromDateTime(nowLocal.DateTime);
        var dayStartUtc = new DateTimeOffset(todayDate.ToDateTime(TimeOnly.MinValue), zone).UtcDateTime;
        var dayEndUtc = dayStartUtc.AddDays(1);

        var bookings = await db.Bookings.AsNoTracking()
            .Include(b => b.ServiceType)
            .Include(b => b.Customer)
            .Include(b => b.QueueEntry)
            .Where(b => b.BranchId == branchId
                        && b.SlotStart >= new DateTimeOffset(dayStartUtc, TimeSpan.Zero)
                        && b.SlotStart < new DateTimeOffset(dayEndUtc, TimeSpan.Zero))
            .OrderBy(b => b.SlotStart)
            .ToListAsync(ct);

        int confirmed = 0, checkedIn = 0, noShow = 0, cancelled = 0, completed = 0;
        foreach (var bk in bookings)
        {
            switch (bk.Status)
            {
                case BookingStatus.Confirmed: confirmed++; break;
                case BookingStatus.CheckedIn: checkedIn++; break;
                case BookingStatus.NoShow: noShow++; break;
                case BookingStatus.Cancelled: cancelled++; break;
                case BookingStatus.Completed: completed++; break;
            }
        }

        var rows = bookings.Select(bk =>
        {
            var customerName = bk.Customer?.Email ?? "Unknown";
            var status = bk.Status.ToString();
            if (bk.QueueEntry is { State: QueueEntryState.Serving }) status = "Serving";
            else if (bk.QueueEntry is { State: QueueEntryState.Waiting }) status = "Waiting";

            return new ManagerAppointmentRowDto(
                bk.Id,
                customerName,
                bk.ServiceType.Name,
                bk.SlotStart,
                bk.SlotEnd,
                status);
        }).ToList();

        return new ManagerAppointmentsTodayDto(
            bookings.Count, checkedIn, confirmed, noShow, cancelled, rows);
    }

    // ─────────────────────────────────────────────────────────────────────
    // MANAGER INSIGHTS
    // ─────────────────────────────────────────────────────────────────────

    public async Task<ManagerInsightsDto> GetManagerInsightsAsync(Guid branchId, CancellationToken cancellationToken = default)
    {
        var branchEntity = await db.Branches.AsNoTracking()
                                .FirstOrDefaultAsync(b => b.Id == branchId, cancellationToken)
                            ?? throw new InvalidOperationException("Branch not found.");

        var alerts = new List<ManagerInsightAlertDto>();
        var suggestions = new List<ManagerSuggestionDto>();
        var dayStart = DateTimeOffset.UtcNow.UtcDateTime.Date;
        var dayEnd = dayStart.AddDays(1);
        var dayStartOffset = new DateTimeOffset(dayStart, TimeSpan.Zero);
        var dayEndOffset = new DateTimeOffset(dayEnd, TimeSpan.Zero);

        var zone = TimeSpan.FromMinutes(branchEntity.ServiceZoneOffsetMinutes);
        var nowAtBranch = DateTimeOffset.UtcNow.ToOffset(zone);
        var slotMin = branchEntity.SlotDurationMinutes < 1 ? 30 : branchEntity.SlotDurationMinutes;
        var todayLocal = DateOnly.FromDateTime(nowAtBranch.DateTime);
        DateTimeOffset nextStart;
        DateTimeOffset nextEnd;
        var validNextWindow = false;
        var todaySvcWindow = await GetBranchLocalServiceWindowAsync(branchEntity.Id, todayLocal, zone, cancellationToken);
        if (todaySvcWindow is { } tw)
        {
            var windowStart = tw.Start;
            var windowEnd = tw.End;
            nextStart = AlignSlot(nowAtBranch, slotMin, windowStart);
            if (nextStart < windowStart) nextStart = windowStart;
            while (nextStart <= nowAtBranch && nextStart < windowEnd)
                nextStart = nextStart.AddMinutes(slotMin);
            nextEnd = nextStart.AddMinutes(slotMin);
            validNextWindow = nextStart < windowEnd && nextEnd <= windowEnd;
        }
        else
        {
            nextStart = default;
            nextEnd = default;
        }

        var waitingTotal = await db.QueueEntries.CountAsync(
            q => q.BranchId == branchId && q.State == QueueEntryState.Waiting, cancellationToken);
        var activeAll = await db.Counters.CountAsync(
            c => c.BranchId == branchId && c.Mode == CounterMode.Active, cancellationToken);

        var counters = await db.Counters.AsNoTracking()
            .Include(c => c.AllowedServices)
            .Where(c => c.BranchId == branchId)
            .OrderBy(c => c.Number)
            .ToListAsync(cancellationToken);

        if (activeAll == 0 && waitingTotal > 0)
            alerts.Add(new ManagerInsightAlertDto("critical", "No active counters while customers are waiting."));
        if (waitingTotal >= 25)
            alerts.Add(new ManagerInsightAlertDto("warning", $"High branch queue depth: {waitingTotal} waiting."));
        if (activeAll > 0 && waitingTotal >= activeAll * 10)
            alerts.Add(new ManagerInsightAlertDto("warning", "Possible understaffing: very high wait-to-counter ratio."));

        var services = await db.ServiceTypes.AsNoTracking()
            .Where(s => s.BranchId == branchId).OrderBy(s => s.Name).ToListAsync(cancellationToken);

        var lanes = new List<ManagerLaneAnalyticsDto>();
        foreach (var svc in services)
        {
            var w = await db.QueueEntries.CountAsync(
                q => q.BranchId == branchId && q.ServiceTypeId == svc.Id && q.State == QueueEntryState.Waiting, cancellationToken);
            var serving = await db.QueueEntries.CountAsync(
                q => q.BranchId == branchId && q.ServiceTypeId == svc.Id && q.State == QueueEntryState.Serving, cancellationToken);
            var ac = await CountActiveLaneCountersAsync(branchId, svc.Id, cancellationToken);
            // Aggregate lane ETA — uses legacy formula (no per-entry features available)
            var eta = WaitTimeEstimator.EstimateMinutes(w + serving, svc.DefaultAvgServiceMinutes, Math.Max(1, ac));

            if (w > 0 && ac == 0)
                alerts.Add(new ManagerInsightAlertDto("warning",
                    $"Lane «{svc.Name}» has {w} waiting but no counter open for that lane."));
            if (!double.IsInfinity(eta) && eta > 30)
                alerts.Add(new ManagerInsightAlertDto("warning",
                    $"Lane «{svc.Name}» estimated wait ~{Math.Round(eta)} min (long wait)."));

            var avgNullable = await db.ServiceSessionLogs.AsNoTracking()
                .Where(l => l.ServiceTypeId == svc.Id)
                .AverageAsync(l => (double?)l.DurationSeconds, cancellationToken);

            var completedToday = await db.ServiceSessionLogs.CountAsync(
                l => l.ServiceTypeId == svc.Id && l.EndedAt >= dayStartOffset && l.EndedAt < dayEndOffset, cancellationToken);

            // Capacity monitoring: compare active online bookings vs OnlineSlotsPerSlot
            int? nextOnlineCapacity = null;
            if (validNextWindow)
            {
                nextOnlineCapacity = svc.OnlineSlotsPerSlot;
                var usedNext = await CountActiveOnlineBookingsForSlotAsync(
                    branchId, svc.Id, nextStart, nextEnd, null, cancellationToken);
                if (usedNext > svc.OnlineSlotsPerSlot)
                    alerts.Add(new ManagerInsightAlertDto("critical",
                        $"Capacity monitoring: lane «{svc.Name}» has {usedNext} active online bookings in upcoming window ({FormatIsoOffset(nextStart)}) but only {svc.OnlineSlotsPerSlot} online slots."));
            }

            lanes.Add(new ManagerLaneAnalyticsDto(
                svc.Id, svc.Name, w, ac,
                double.IsInfinity(eta) ? null : Math.Round(eta, 1),
                Math.Round((avgNullable ?? 0.0) / 60.0, 2),
                completedToday,
                nextOnlineCapacity, null,
                validNextWindow ? FormatIsoOffset(nextStart) : null));

            if (w > 0 && ac == 0)
            {
                var candidate = counters.FirstOrDefault(c => c.Mode != CounterMode.Active && CounterCanServeLane(c, svc.Id));
                if (candidate != null)
                    suggestions.Add(new ManagerSuggestionDto("open_counter",
                        $"Open counter #{candidate.Number}",
                        $"Lane «{svc.Name}» has {w} waiting. Counter #{candidate.Number} can serve this lane once set to Active.",
                        svc.Id, candidate.Number, candidate.Id));
            }
            else if (w >= 8 && ac <= 1)
            {
                var onBreak = counters.FirstOrDefault(c => c.Mode == CounterMode.Break && CounterCanServeLane(c, svc.Id));
                if (onBreak != null)
                    suggestions.Add(new ManagerSuggestionDto("end_break",
                        $"Consider ending break · counter #{onBreak.Number}",
                        $"Lane «{svc.Name}» is deep ({w} waiting) with only {ac} active counter(s).",
                        svc.Id, onBreak.Number, onBreak.Id));
            }
        }

        var missedToday = await db.QueueEntries.CountAsync(
            q => q.BranchId == branchId && q.State == QueueEntryState.Missed
                 && q.CalledAt >= dayStartOffset && q.CalledAt < dayEndOffset, cancellationToken);

        return new ManagerInsightsDto(
            alerts.DistinctBy(a => a.Message).ToList(),
            suggestions.DistinctBy(s => s.Title + "|" + s.Detail).Take(12).ToList(),
            lanes,
            missedToday);
    }

    public async Task<BranchAnalyticsTodayDto> GetBranchAnalyticsTodayAsync(
        Guid branchId, CancellationToken cancellationToken = default)
    {
        const double slaThresholdMinutes = 15;
        var branch = await db.Branches.AsNoTracking()
                           .FirstOrDefaultAsync(b => b.Id == branchId, cancellationToken)
                       ?? throw new InvalidOperationException("Branch not found.");

        var zone = TimeSpan.FromMinutes(branch.ServiceZoneOffsetMinutes);
        var nowBranch = DateTimeOffset.UtcNow.ToOffset(zone);
        var dayStart = new DateTimeOffset(nowBranch.Date, zone);
        var dayEnd = dayStart.AddDays(1);
        var elapsedMinutes = Math.Max(1.0, (nowBranch - dayStart).TotalMinutes);

        var services = await db.ServiceTypes.AsNoTracking()
            .Where(s => s.BranchId == branchId).OrderBy(s => s.Name).ToListAsync(cancellationToken);
        var serviceNameById = services.ToDictionary(s => s.Id, s => s.Name);

        var ticketsTodayRows = await db.QueueEntries.AsNoTracking()
            .Where(q => q.BranchId == branchId && q.CreatedAt >= dayStart && q.CreatedAt < dayEnd)
            .Select(q => new { q.State, q.EntryType, q.CreatedAt, q.ServiceTypeId })
            .ToListAsync(cancellationToken);

        var hourly = new Dictionary<int, int>();
        foreach (var e in ticketsTodayRows)
        {
            var h = e.CreatedAt.ToOffset(zone).Hour;
            hourly[h] = hourly.GetValueOrDefault(h) + 1;
        }

        var ticketsByHour = hourly.OrderBy(kv => kv.Key)
            .Select(kv => new HourlyCountDto($"{kv.Key:00}:00", kv.Value))
            .ToList();

        OperationalPeakDto? peak = null;
        if (hourly.Count > 0)
        {
            var peakKv = hourly.OrderByDescending(kv => kv.Value).First();
            var avgHourly = hourly.Values.Average();
            var aboveAvg = avgHourly > 0
                ? Math.Round((peakKv.Value - avgHourly) / avgHourly * 100.0, 0)
                : (double?)null;
            var peakHourTickets = ticketsTodayRows
                .Where(t => t.CreatedAt.ToOffset(zone).Hour == peakKv.Key)
                .GroupBy(t => t.ServiceTypeId)
                .OrderByDescending(g => g.Count())
                .FirstOrDefault();
            var topSvc = peakHourTickets != null && serviceNameById.TryGetValue(peakHourTickets.Key, out var nm) ? nm : null;
            var activeCounters = await db.Counters.CountAsync(
                c => c.BranchId == branchId && c.Mode == CounterMode.Active, cancellationToken);
            var totalCounters = await db.Counters.CountAsync(c => c.BranchId == branchId, cancellationToken);
            peak = new OperationalPeakDto(
                $"{peakKv.Key:00}:00 – {(peakKv.Key + 1) % 24:00}:00",
                peakKv.Value,
                aboveAvg,
                topSvc,
                activeCounters,
                totalCounters);
        }

        var completed = await db.QueueEntries.AsNoTracking()
            .Where(q => q.BranchId == branchId
                        && q.State == QueueEntryState.Completed
                        && q.ServingEndedAt >= dayStart
                        && q.ServingEndedAt < dayEnd
                        && q.CalledAt != null)
            .Select(q => new
            {
                q.EntryType,
                q.ServiceTypeId,
                q.QueueId,
                q.CalledAt,
                q.CreatedAt,
                q.AssignedSlotStart,
                CheckedInAt = q.Booking != null ? q.Booking.CheckedInAt : null,
            })
            .ToListAsync(cancellationToken);

        var ticketToCallList = completed
            .Select(c => TicketToCallMetrics.MinutesToCall(
                c.CalledAt!.Value, c.EntryType, c.CreatedAt, c.CheckedInAt, c.AssignedSlotStart))
            .ToList();
        var slaMet = ticketToCallList.Count(w => w <= slaThresholdMinutes);
        var slaPercent = ticketToCallList.Count > 0
            ? Math.Round(slaMet * 100.0 / ticketToCallList.Count, 1)
            : (double?)null;

        var ticketToCall = new TimingSummaryDto(
            ticketToCallList.Count > 0 ? Math.Round(ticketToCallList.Average(), 1) : 0,
            MedianMinutes(ticketToCallList),
            ticketToCallList.Count > 0 ? Math.Round(ticketToCallList.Max(), 1) : null,
            slaMet,
            ticketToCallList.Count - slaMet);

        var buckets = new int[5];
        foreach (var w in ticketToCallList)
        {
            if (w < 5) buckets[0]++;
            else if (w < 10) buckets[1]++;
            else if (w < 15) buckets[2]++;
            else if (w < 20) buckets[3]++;
            else buckets[4]++;
        }

        var ticketToCallDistribution = new List<WaitBucketDto>
        {
            new("0–5 min", buckets[0]),
            new("5–10 min", buckets[1]),
            new("10–15 min", buckets[2]),
            new("15–20 min", buckets[3]),
            new("20+ min", buckets[4]),
        };

        var serviceDurationSeconds = await db.ServiceSessionLogs.AsNoTracking()
            .Where(l => l.EndedAt >= dayStart && l.EndedAt < dayEnd && l.ServiceType.BranchId == branchId)
            .Select(l => (double)l.DurationSeconds)
            .ToListAsync(cancellationToken);
        var serviceMinutes = serviceDurationSeconds.Select(s => s / 60.0).ToList();
        var serviceDuration = new TimingSummaryDto(
            serviceMinutes.Count > 0 ? Math.Round(serviceMinutes.Average(), 1) : 0,
            MedianMinutes(serviceMinutes),
            serviceMinutes.Count > 0 ? Math.Round(serviceMinutes.Max(), 1) : null,
            null,
            null);

        var cancelledBookings = await db.Bookings.CountAsync(
            b => b.BranchId == branchId
                 && b.Status == BookingStatus.Cancelled
                 && b.SlotStart >= dayStart
                 && b.SlotStart < dayEnd,
            cancellationToken);

        var ticketStatus = new TicketStatusSummaryDto(
            ticketsTodayRows.Count,
            ticketsTodayRows.Count(t => t.State == QueueEntryState.Completed),
            ticketsTodayRows.Count(t => t.State == QueueEntryState.Waiting),
            ticketsTodayRows.Count(t => t.State == QueueEntryState.Serving),
            ticketsTodayRows.Count(t => t.State == QueueEntryState.Missed),
            cancelledBookings);

        var walkInToday = ticketsTodayRows.Where(t => t.EntryType == QueueEntryType.WalkIn).ToList();
        var onlineToday = ticketsTodayRows.Where(t => t.EntryType == QueueEntryType.OnlineBooked).ToList();
        var walkInCompleted = completed.Where(c => c.EntryType == QueueEntryType.WalkIn).ToList();
        var onlineCompleted = completed.Where(c => c.EntryType == QueueEntryType.OnlineBooked).ToList();

        ChannelAnalyticsDto ChannelStats(
            int tickets,
            int served,
            int noShows,
            IReadOnlyList<double> toCallMinutes)
        {
            var rate = tickets > 0 ? Math.Round(noShows * 100.0 / tickets, 1) : (double?)null;
            double? avg = toCallMinutes.Count > 0 ? Math.Round(toCallMinutes.Average(), 1) : null;
            return new ChannelAnalyticsDto(tickets, served, noShows, rate, avg);
        }

        var walkInChannel = ChannelStats(
            walkInToday.Count,
            walkInToday.Count(t => t.State == QueueEntryState.Completed),
            walkInToday.Count(t => t.State == QueueEntryState.Missed),
            walkInCompleted.Select(c => TicketToCallMetrics.MinutesToCall(
                c.CalledAt!.Value, c.EntryType, c.CreatedAt, c.CheckedInAt, c.AssignedSlotStart)).ToList());

        var onlineChannel = ChannelStats(
            onlineToday.Count,
            onlineToday.Count(t => t.State == QueueEntryState.Completed),
            onlineToday.Count(t => t.State == QueueEntryState.Missed),
            onlineCompleted.Select(c => TicketToCallMetrics.MinutesToCall(
                c.CalledAt!.Value, c.EntryType, c.CreatedAt, c.CheckedInAt, c.AssignedSlotStart)).ToList());

        var laneRows = new List<LanePerformanceDto>();
        foreach (var svc in services)
        {
            var laneCompleted = completed.Where(c => c.ServiceTypeId == svc.Id).ToList();
            var toCall = laneCompleted
                .Select(c => TicketToCallMetrics.MinutesToCall(
                    c.CalledAt!.Value, c.EntryType, c.CreatedAt, c.CheckedInAt, c.AssignedSlotStart))
                .ToList();
            var avgCall = toCall.Count > 0 ? Math.Round(toCall.Average(), 1) : (double?)null;
            var maxCall = toCall.Count > 0 ? Math.Round(toCall.Max(), 1) : (double?)null;
            var avgSvc = await db.ServiceSessionLogs.AsNoTracking()
                .Where(l => l.ServiceTypeId == svc.Id && l.EndedAt >= dayStart && l.EndedAt < dayEnd)
                .AverageAsync(l => (double?)l.DurationSeconds, cancellationToken);
            var avgSvcMin = avgSvc.HasValue ? Math.Round(avgSvc.Value / 60.0, 1) : (double?)null;
            double? laneSla = toCall.Count > 0
                ? Math.Round(toCall.Count(w => w <= slaThresholdMinutes) * 100.0 / toCall.Count, 0)
                : null;
            laneRows.Add(new LanePerformanceDto(
                svc.Id, svc.Name, laneCompleted.Count, avgCall, maxCall, avgSvcMin, laneSla));
        }

        // 档 B: per-queue performance (letter series)
        var branchQueues = await db.BranchQueues.AsNoTracking()
            .Where(q => q.BranchId == branchId)
            .OrderBy(q => q.TicketPrefix)
            .ToListAsync(cancellationToken);
        var openNow = await db.QueueEntries.AsNoTracking()
            .Where(e => e.BranchId == branchId
                        && (e.State == QueueEntryState.Waiting || e.State == QueueEntryState.Serving))
            .Select(e => new { e.QueueId, e.State, e.QueueEligibleAt, e.CreatedAt })
            .ToListAsync(cancellationToken);
        var nowUtc = DateTimeOffset.UtcNow;
        var queueRows = new List<QueuePerformanceDto>();
        var serviceQueueMap = services
            .Where(s => s.QueueId != null)
            .ToDictionary(s => s.Id, s => s.QueueId!.Value);
        foreach (var q in branchQueues)
        {
            var qCompleted = completed.Where(c =>
                c.QueueId == q.Id
                || (c.QueueId == null && serviceQueueMap.TryGetValue(c.ServiceTypeId, out var mapped) && mapped == q.Id)
            ).ToList();
            var toCall = qCompleted
                .Select(c => TicketToCallMetrics.MinutesToCall(
                    c.CalledAt!.Value, c.EntryType, c.CreatedAt, c.CheckedInAt, c.AssignedSlotStart))
                .ToList();
            var avgCall = toCall.Count > 0 ? Math.Round(toCall.Average(), 1) : (double?)null;
            var waiting = openNow.Where(e => e.QueueId == q.Id && e.State == QueueEntryState.Waiting).ToList();
            var serving = openNow.Count(e => e.QueueId == q.Id && e.State == QueueEntryState.Serving);
            var breaches = waiting.Count(e =>
            {
                var start = e.QueueEligibleAt ?? e.CreatedAt;
                return (nowUtc - start).TotalMinutes > q.ServiceLevelMinutes;
            });
            queueRows.Add(new QueuePerformanceDto(
                q.Id, q.Name, q.TicketPrefix, waiting.Count, serving, qCompleted.Count,
                avgCall, breaches, q.ServiceLevelMinutes));
        }

        var missedRows = await db.QueueEntries.AsNoTracking()
            .Where(q => q.BranchId == branchId
                        && q.State == QueueEntryState.Missed
                        && q.CalledAt >= dayStart
                        && q.CalledAt < dayEnd)
            .Select(q => q.CalledAt!.Value)
            .ToListAsync(cancellationToken);
        var noShowHourly = new Dictionary<int, int>();
        foreach (var at in missedRows)
        {
            var h = at.ToOffset(zone).Hour;
            noShowHourly[h] = noShowHourly.GetValueOrDefault(h) + 1;
        }
        var noShowsByHour = noShowHourly.OrderBy(kv => kv.Key)
            .Select(kv => new HourlyCountDto($"{kv.Key:00}:00", kv.Value))
            .ToList();

        var counters = await db.Counters.AsNoTracking()
            .Include(c => c.AssignedStaff)
            .Where(c => c.BranchId == branchId)
            .OrderBy(c => c.Number)
            .ToListAsync(cancellationToken);

        var sessionByCounter = await db.ServiceSessionLogs.AsNoTracking()
            .Where(l => l.CounterId != null && l.EndedAt >= dayStart && l.EndedAt < dayEnd)
            .Where(l => l.ServiceType.BranchId == branchId)
            .GroupBy(l => l.CounterId!.Value)
            .Select(g => new { CounterId = g.Key, TotalSeconds = g.Sum(x => x.DurationSeconds), Served = g.Count() })
            .ToListAsync(cancellationToken);
        var sessionLookup = sessionByCounter.ToDictionary(x => x.CounterId);

        var counterUtilization = counters.Select(c =>
        {
            sessionLookup.TryGetValue(c.Id, out var stats);
            var served = stats?.Served ?? 0;
            var util = stats != null
                ? Math.Round(Math.Min(100.0, stats.TotalSeconds / (elapsedMinutes * 60.0) * 100.0), 0)
                : 0.0;
            return new CounterUtilizationRowDto(
                c.Id,
                c.Number,
                c.AssignedStaff?.Email,
                c.Mode.ToString(),
                served,
                util);
        }).ToList();

        return new BranchAnalyticsTodayDto(
            ticketsTodayRows.Count,
            completed.Count,
            ticketToCall,
            serviceDuration,
            slaPercent,
            slaThresholdMinutes,
            ticketStatus,
            walkInChannel,
            onlineChannel,
            ticketsByHour,
            peak,
            ticketToCallDistribution,
            laneRows,
            counterUtilization,
            noShowsByHour,
            queueRows);
    }

    public async Task<ServiceLaneSummaryDto> GetServiceLaneSummaryAsync(
        Guid branchId, Guid serviceTypeId, CancellationToken cancellationToken = default)
    {
        var svc = await db.ServiceTypes.AsNoTracking().FirstOrDefaultAsync(
                      s => s.Id == serviceTypeId && s.BranchId == branchId, cancellationToken)
                  ?? throw new InvalidOperationException("Service not found.");

        var branch = await db.Branches.AsNoTracking().FirstAsync(b => b.Id == branchId, cancellationToken);
        var zone = TimeSpan.FromMinutes(branch.ServiceZoneOffsetMinutes);
        var nowAtBranch = DateTimeOffset.UtcNow.ToOffset(zone);
        var todayDate = nowAtBranch.Date;

        var allWaiting = await db.QueueEntries.AsNoTracking()
            .Where(q => q.BranchId == branchId && q.ServiceTypeId == serviceTypeId && q.State == QueueEntryState.Waiting)
            .ToListAsync(cancellationToken);
        var waiting = allWaiting.Count(q => q.AssignedSlotStart.HasValue && q.AssignedSlotStart.Value.ToOffset(zone).Date == todayDate);

        var serving = await db.QueueEntries.CountAsync(
            q => q.BranchId == branchId && q.ServiceTypeId == serviceTypeId && q.State == QueueEntryState.Serving, cancellationToken);
        var active = await CountActiveLaneCountersAsync(branchId, serviceTypeId, cancellationToken);
        // Aggregate lane ETA — uses legacy formula (no per-entry features available)
        var eta = WaitTimeEstimator.EstimateMinutes(waiting + serving, svc.DefaultAvgServiceMinutes, Math.Max(1, active));

        var crowd = waiting switch { < 5 => "Low", < 15 => "Medium", _ => "High" };
        return new ServiceLaneSummaryDto(serviceTypeId, svc.Name, waiting,
            double.IsInfinity(eta) ? null : Math.Round(eta, 1), crowd);
    }

    // ─────────────────────────────────────────────────────────────────────
    // PRIVATE HELPERS
    // ─────────────────────────────────────────────────────────────────────

    public async Task<int> CountActiveLaneCountersAsync(Guid branchId, Guid laneServiceTypeId, CancellationToken cancellationToken)
    {
        var counters = await db.Counters.AsNoTracking()
            .Include(c => c.AllowedServices)
            .Where(c => c.BranchId == branchId && c.Mode == CounterMode.Active)
            .ToListAsync(cancellationToken);
        return counters.Count(c => CounterCanServeLane(c, laneServiceTypeId));
    }

    private static bool CounterCanServeLane(Counter counter, Guid laneServiceTypeId)
    {
        if (counter.AllowedServices.Count == 0) return false;
        return counter.AllowedServices.Any(a => a.ServiceTypeId == laneServiceTypeId);
    }

    private async Task<int> CountActiveOnlineBookingsForSlotAsync(
        Guid branchId, Guid serviceTypeId, DateTimeOffset slotStart, DateTimeOffset slotEnd,
        Guid? excludeBookingId, CancellationToken cancellationToken)
    {
        return await db.Bookings.CountAsync(
            b => (!excludeBookingId.HasValue || b.Id != excludeBookingId.Value)
                 && b.BranchId == branchId && b.ServiceTypeId == serviceTypeId
                 && (b.Status == BookingStatus.Pending || b.Status == BookingStatus.Confirmed || b.Status == BookingStatus.CheckedIn)
                 && b.SlotStart < slotEnd && b.SlotEnd > slotStart,
            cancellationToken);
    }

    /// <summary>Allocate next daily sequence within a service queue (档 B). Lower = earlier in that queue.</summary>
    private async Task<long> AllocateQueueSequenceAsync(
        Guid queueId, Guid branchId, TimeSpan branchZone, CancellationToken cancellationToken)
    {
        var nowBranch = DateTimeOffset.UtcNow.ToOffset(branchZone);
        var dayStart = new DateTimeOffset(nowBranch.Year, nowBranch.Month, nowBranch.Day, 0, 0, 0, branchZone);
        var dayEnd = dayStart.AddDays(1);

        var maxSeq = await db.QueueEntries
            .Where(q => q.QueueId == queueId
                        && q.BranchId == branchId
                        && q.CreatedAt >= dayStart
                        && q.CreatedAt < dayEnd)
            .MaxAsync(q => (long?)q.EnqueueSequence, cancellationToken);

        return (maxSeq ?? 0L) + 1L;
    }


    // ─────────────────────────────────────────────────────────────────────
    // 档 B: list queues + transfer between queues
    // ─────────────────────────────────────────────────────────────────────

    public async Task<IReadOnlyList<BranchQueueDto>> ListBranchQueuesAsync(
        Guid branchId, CancellationToken cancellationToken = default)
    {
        var queues = await db.BranchQueues.AsNoTracking()
            .Where(q => q.BranchId == branchId)
            .OrderBy(q => q.TicketPrefix)
            .ToListAsync(cancellationToken);

        var services = await db.ServiceTypes.AsNoTracking()
            .Where(s => s.BranchId == branchId)
            .ToListAsync(cancellationToken);

        var openTickets = await db.QueueEntries.AsNoTracking()
            .Where(e => e.BranchId == branchId
                        && (e.State == QueueEntryState.Waiting || e.State == QueueEntryState.Serving))
            .Select(e => new { e.QueueId, e.State, e.QueueEligibleAt, e.CreatedAt })
            .ToListAsync(cancellationToken);

        var nowUtc = DateTimeOffset.UtcNow;

        return queues.Select(q =>
        {
            var svcForQ = services.Where(s => s.QueueId == q.Id).ToList();
            var tickets = openTickets.Where(e => e.QueueId == q.Id).ToList();
            var waiting = tickets.Where(e => e.State == QueueEntryState.Waiting).ToList();
            var serving = tickets.Count(e => e.State == QueueEntryState.Serving);
            double? longest = null;
            var breaches = 0;
            foreach (var e in waiting)
            {
                var start = e.QueueEligibleAt ?? e.CreatedAt;
                var mins = (nowUtc - start).TotalMinutes;
                if (longest is null || mins > longest) longest = mins;
                if (mins > q.ServiceLevelMinutes) breaches++;
            }
            return new BranchQueueDto(
                q.Id, q.Name, q.TicketPrefix, q.ServiceLevelMinutes, q.IsActive,
                waiting.Count, serving,
                longest is null ? null : Math.Round(longest.Value, 1),
                breaches,
                svcForQ.Select(s => s.Name).ToList(),
                svcForQ.Select(s => s.Id).ToList());
        }).ToList();
    }

    public async Task<BranchQueueDto> CreateBranchQueueAsync(
        Guid branchId, string name, string ticketPrefix, int serviceLevelMinutes,
        CancellationToken cancellationToken = default)
    {
        _ = await db.Branches.FirstOrDefaultAsync(b => b.Id == branchId, cancellationToken)
            ?? throw new InvalidOperationException("Branch not found.");

        var prefix = NormalizePrefix(ticketPrefix);
        await EnsurePrefixAvailableAsync(branchId, prefix, excludeQueueId: null, cancellationToken);

        if (serviceLevelMinutes < 1 || serviceLevelMinutes > 240)
            throw new InvalidOperationException("SLA must be between 1 and 240 minutes.");

        var queue = new BranchQueue
        {
            Id = Guid.NewGuid(),
            BranchId = branchId,
            Name = string.IsNullOrWhiteSpace(name) ? $"Queue {prefix}" : name.Trim(),
            TicketPrefix = prefix,
            ServiceLevelMinutes = serviceLevelMinutes,
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow,
        };
        db.BranchQueues.Add(queue);
        await db.SaveChangesAsync(cancellationToken);
        return (await ListBranchQueuesAsync(branchId, cancellationToken)).First(q => q.Id == queue.Id);
    }

    public async Task<BranchQueueDto> UpdateBranchQueueAsync(
        Guid branchId, Guid queueId, string? name, string? ticketPrefix, int? serviceLevelMinutes, bool? isActive,
        CancellationToken cancellationToken = default)
    {
        var queue = await db.BranchQueues.FirstOrDefaultAsync(q => q.Id == queueId && q.BranchId == branchId, cancellationToken)
                    ?? throw new InvalidOperationException("Queue not found.");

        if (ticketPrefix is not null)
        {
            var prefix = NormalizePrefix(ticketPrefix);
            await EnsurePrefixAvailableAsync(branchId, prefix, queueId, cancellationToken);
            queue.TicketPrefix = prefix;
        }

        if (name is not null)
        {
            var n = name.Trim();
            if (n.Length == 0) throw new InvalidOperationException("Queue name cannot be empty.");
            queue.Name = n;
        }

        if (serviceLevelMinutes is not null)
        {
            if (serviceLevelMinutes < 1 || serviceLevelMinutes > 240)
                throw new InvalidOperationException("SLA must be between 1 and 240 minutes.");
            queue.ServiceLevelMinutes = serviceLevelMinutes.Value;
        }

        if (isActive is not null)
            queue.IsActive = isActive.Value;

        await db.SaveChangesAsync(cancellationToken);
        return (await ListBranchQueuesAsync(branchId, cancellationToken)).First(q => q.Id == queue.Id);
    }

    /// <summary>
    /// Assign services to this queue (moves them off any previous queue). Waiting tickets follow.
    /// </summary>
    public async Task<BranchQueueDto> SetQueueServicesAsync(
        Guid branchId, Guid queueId, IReadOnlyList<Guid> serviceTypeIds,
        CancellationToken cancellationToken = default)
    {
        var queue = await db.BranchQueues.FirstOrDefaultAsync(q => q.Id == queueId && q.BranchId == branchId, cancellationToken)
                    ?? throw new InvalidOperationException("Queue not found.");

        var services = await db.ServiceTypes.Where(s => s.BranchId == branchId).ToListAsync(cancellationToken);
        var idSet = serviceTypeIds.Distinct().ToHashSet();
        foreach (var sid in idSet)
        {
            if (services.All(s => s.Id != sid))
                throw new InvalidOperationException("One or more services are not at this branch.");
        }

        // Move listed services onto this queue (they leave any previous queue).
        // Services omitted keep their current queue — never orphan a service (QueueId null breaks ticketing).
        foreach (var s in services.Where(s => idSet.Contains(s.Id)))
            s.QueueId = queueId;

        // Keep open tickets aligned with their service's queue
        var open = await db.QueueEntries
            .Where(e => e.BranchId == branchId
                        && (e.State == QueueEntryState.Waiting
                            || e.State == QueueEntryState.Called
                            || e.State == QueueEntryState.Serving))
            .ToListAsync(cancellationToken);
        var svcMap = services.ToDictionary(s => s.Id);
        foreach (var e in open)
        {
            if (svcMap.TryGetValue(e.ServiceTypeId, out var svc))
                e.QueueId = svc.QueueId;
        }

        await db.SaveChangesAsync(cancellationToken);
        return (await ListBranchQueuesAsync(branchId, cancellationToken)).First(q => q.Id == queue.Id);
    }

    private static string NormalizePrefix(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            throw new InvalidOperationException("Ticket prefix is required (1–3 letters).");
        var letters = new string(raw.Trim().ToUpperInvariant().Where(c => c is >= 'A' and <= 'Z').ToArray());
        if (letters.Length is < 1 or > 3)
            throw new InvalidOperationException("Ticket prefix must be 1–3 letters (A–Z).");
        return letters;
    }

    private async Task EnsurePrefixAvailableAsync(
        Guid branchId, string prefix, Guid? excludeQueueId, CancellationToken cancellationToken)
    {
        var clash = await db.BranchQueues.AsNoTracking().AnyAsync(
            q => q.BranchId == branchId
                 && q.TicketPrefix == prefix
                 && (excludeQueueId == null || q.Id != excludeQueueId),
            cancellationToken);
        if (clash)
            throw new InvalidOperationException($"Prefix «{prefix}» is already used by another queue at this branch.");
    }

    /// <summary>
    /// Move a waiting/called ticket into another service's queue (new prefix + daily seq).
    /// </summary>
    public async Task<TransferTicketDto> TransferTicketAsync(
        Guid staffId,
        string ticketNumber,
        Guid targetServiceTypeId,
        CancellationToken cancellationToken = default)
    {
        var counter = await db.Counters
            .Include(c => c.Branch)
            .Include(c => c.AllowedServices)
            .FirstOrDefaultAsync(c => c.StaffId == staffId, cancellationToken)
            ?? throw new InvalidOperationException("No counter assigned to this staff user.");

        var entry = await db.QueueEntries
            .Include(q => q.Booking)
            .FirstOrDefaultAsync(
                q => q.BranchId == counter.BranchId && q.TicketNumber == ticketNumber
                     && (q.State == QueueEntryState.Waiting || q.State == QueueEntryState.Called),
                cancellationToken)
            ?? throw new InvalidOperationException("Ticket not found or not transferable (must be Waiting/Called).");

        if (entry.State == QueueEntryState.Serving)
            throw new InvalidOperationException("Finish or miss the ticket before transferring.");

        var target = await db.ServiceTypes.FirstOrDefaultAsync(
                         s => s.Id == targetServiceTypeId && s.BranchId == counter.BranchId, cancellationToken)
                     ?? throw new InvalidOperationException("Target service not found at this branch.");

        if (target.Id == entry.ServiceTypeId)
            throw new InvalidOperationException("Ticket is already in that service queue.");

        if (target.QueueId is null)
            throw new InvalidOperationException($"Target service «{target.Name}» has no queue configured.");

        var oldSeq = entry.EnqueueSequence;
        var oldTicket = entry.TicketNumber;
        var oldSlotStart = entry.AssignedSlotStart;
        var oldSlotEnd = entry.AssignedSlotEnd;

        var (queue, seq, newTicket) = await IssueTicketAsync(counter.Branch, target, cancellationToken);

        entry.ServiceTypeId = target.Id;
        entry.QueueId = queue.Id;
        entry.EnqueueSequence = seq;
        entry.TicketNumber = newTicket;
        entry.State = QueueEntryState.Waiting;
        entry.CalledAt = null;
        entry.CounterId = null;
        entry.QueueEligibleAt = DateTimeOffset.UtcNow;

        if (entry.Booking is not null)
            entry.Booking.ServiceTypeId = target.Id;

        db.QueueMovements.Add(new QueueMovement
        {
            Id = Guid.NewGuid(),
            QueueEntryId = entry.Id,
            FromSlotStart = oldSlotStart,
            FromSlotEnd = oldSlotEnd,
            ToSlotStart = entry.AssignedSlotStart,
            ToSlotEnd = entry.AssignedSlotEnd,
            PreviousEnqueueSequence = oldSeq,
            NewEnqueueSequence = seq,
            MovedAt = DateTimeOffset.UtcNow,
            Reason = QueueMovementReason.QueueTransfer,
        });

        await db.SaveChangesAsync(cancellationToken);

        await hubContext.Clients.Group(QueueHub.BranchGroup(counter.BranchId))
            .SendAsync("QueueUpdated", counter.BranchId, cancellationToken);

        if (entry.Booking?.CustomerId is Guid customerId)
        {
            await notifications.NotifyAsync(
                customerId,
                NotificationKind.Reminder,
                $"Your ticket moved: {oldTicket} → {newTicket} ({target.Name}). Please watch the new number.",
                entry.BookingId,
                newTicket,
                counter.BranchId,
                cancellationToken);
        }

        return new TransferTicketDto(oldTicket, newTicket, target.Name, queue.TicketPrefix);
    }


    private async Task<(BranchQueue Queue, long Seq, string Ticket)> IssueTicketAsync(
        Branch branch, ServiceType service, CancellationToken cancellationToken)
    {
        if (service.QueueId is null)
            throw new InvalidOperationException(
                $"Service «{service.Name}» has no queue. Restart API so ServiceQueueProvisioning can create SERVICE_QUEUES.");

        var queue = await db.BranchQueues.FirstOrDefaultAsync(q => q.Id == service.QueueId, cancellationToken)
                    ?? throw new InvalidOperationException($"Service «{service.Name}» queue row missing.");
        if (!queue.IsActive)
            throw new InvalidOperationException(
                $"Queue «{queue.TicketPrefix} · {queue.Name}» is inactive — reactivate it in Manager → Queues, or move this service to another queue.");
        var zone = TimeSpan.FromMinutes(branch.ServiceZoneOffsetMinutes);
        var seq = await AllocateQueueSequenceAsync(queue.Id, branch.Id, zone, cancellationToken);
        var ticket = FormatTicket(queue.TicketPrefix, seq);
        return (queue, seq, ticket);
    }


    private static double? MedianMinutes(IReadOnlyList<double> values)
    {
        if (values.Count == 0) return null;
        var sorted = values.OrderBy(v => v).ToList();
        var mid = sorted.Count / 2;
        return sorted.Count % 2 == 0
            ? Math.Round((sorted[mid - 1] + sorted[mid]) / 2.0, 1)
            : Math.Round(sorted[mid], 1);
    }

    private static DateTimeOffset AlignSlot(DateTimeOffset now, int slotMinutes, DateTimeOffset? anchor = null)
    {
        if (anchor is { } a)
        {
            // Align relative to anchor (e.g. operating hours start)
            var elapsed = (int)(now - a).TotalMinutes;
            if (elapsed < 0) return a;
            var aligned = elapsed / slotMinutes * slotMinutes;
            return a.AddMinutes(aligned);
        }
        // Fallback: align from midnight
        var minutes = now.Hour * 60 + now.Minute;
        var alignedMin = minutes / slotMinutes * slotMinutes;
        return new DateTimeOffset(now.Year, now.Month, now.Day, 0, 0, 0, now.Offset).AddMinutes(alignedMin);
    }

    private static string FormatTicket(string prefix, long seq)
    {
        var p = string.IsNullOrWhiteSpace(prefix) ? "Q" : prefix.Trim().ToUpperInvariant();
        return $"{p}{seq:000}";
    }

    private static string FormatIsoOffset(DateTimeOffset value) =>
        value.ToString("yyyy-MM-dd'T'HH:mm:ss.fffzzz", CultureInfo.InvariantCulture);

    private static string ToBdsStaff10(Staff? staff)
    {
        if (staff?.Email is not { Length: > 0 } email) return "UNKNOWN";
        return email.Length <= 10 ? email : email[..10];
    }

    private static int DayOfWeekSortKey(string dayOfWeek) =>
        dayOfWeek switch
        {
            "Monday" => 0, "Tuesday" => 1, "Wednesday" => 2, "Thursday" => 3,
            "Friday" => 4, "Saturday" => 5, "Sunday" => 6, _ => 99,
        };

    private async Task ReplaceBranchWeeklyOperatingHoursAsync(
        Guid branchId, IReadOnlyList<BranchOperatingHourRow> rows, CancellationToken cancellationToken)
    {
        if (rows.Count != 7)
            throw new InvalidOperationException("Weekly operating hours must include exactly 7 rows (Monday through Sunday).");

        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var r in rows)
        {
            if (!seen.Add(r.DayOfWeek))
                throw new InvalidOperationException($"Duplicate day: {r.DayOfWeek}.");
            if (DayOfWeekSortKey(r.DayOfWeek) == 99)
                throw new InvalidOperationException($"Invalid weekday name: {r.DayOfWeek} (use Monday..Sunday).");
            if (r.IsClosed) continue;
            if (r.OpenMinutesFromMidnight is null || r.CloseMinutesFromMidnight is null)
                throw new InvalidOperationException($"Open and close minutes required when {r.DayOfWeek} is not closed.");
            if (r.OpenMinutesFromMidnight.Value < 0 || r.CloseMinutesFromMidnight.Value > 24 * 60
                || r.OpenMinutesFromMidnight.Value >= r.CloseMinutesFromMidnight.Value)
                throw new InvalidOperationException($"Invalid open/close for {r.DayOfWeek}.");
        }

        if (!seen.SetEquals(new[] { "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday" }))
            throw new InvalidOperationException("Weekly operating hours must list Monday through Sunday exactly once each.");

        var existing = await db.BranchOperatingHours.Where(h => h.BranchId == branchId).ToListAsync(cancellationToken);
        db.BranchOperatingHours.RemoveRange(existing);

        foreach (var r in rows.OrderBy(x => DayOfWeekSortKey(x.DayOfWeek)))
        {
            db.BranchOperatingHours.Add(new BranchOperatingHour
            {
                Id = Guid.NewGuid(),
                BranchId = branchId,
                DayOfWeek = r.DayOfWeek,
                IsClosed = r.IsClosed,
                OpenTime = r.IsClosed ? null : TimeSpan.FromMinutes(r.OpenMinutesFromMidnight!.Value),
                CloseTime = r.IsClosed ? null : TimeSpan.FromMinutes(r.CloseMinutesFromMidnight!.Value),
            });
        }
    }

    public async Task<bool> IsBranchOpenForOperationsAsync(Guid branchId, CancellationToken cancellationToken = default)
    {
        var branch = await db.Branches.AsNoTracking().FirstOrDefaultAsync(b => b.Id == branchId, cancellationToken);
        if (branch is null)
            return false;

        var now = DateTimeOffset.UtcNow;

        var hours = await db.BranchOperatingHours.AsNoTracking()
            .Where(h => h.BranchId == branchId)
            .ToListAsync(cancellationToken);

        var closures = await db.BranchClosures.AsNoTracking()
            .Where(c => c.BranchId == branchId && c.ClosedFrom <= now && c.ClosedTo >= now)
            .ToListAsync(cancellationToken);

        return BranchHoursEvaluator.IsBranchOpenNow(branch, hours, now, closures);
    }

    private async Task AssertBranchOpenForCounterOperationsAsync(Guid branchId, CancellationToken cancellationToken)
    {
        if (!await IsBranchOpenForOperationsAsync(branchId, cancellationToken))
            throw new InvalidOperationException(
                "Counters cannot be opened outside branch operating hours. Update Schedule & capacity or wait until the branch opens.");
    }

    private async Task<(DateTimeOffset Start, DateTimeOffset End)?> GetBranchLocalServiceWindowAsync(
        Guid branchId, DateOnly calendarDay, TimeSpan zone, CancellationToken cancellationToken)
    {
        var dowName = calendarDay.DayOfWeek.ToString();
        var row = await db.BranchOperatingHours.AsNoTracking()
            .Where(h => h.BranchId == branchId && h.DayOfWeek == dowName)
            .FirstOrDefaultAsync(cancellationToken);
        if (row is null || row.IsClosed || row.OpenTime is null || row.CloseTime is null)
            return null;

        var sm = (int)row.OpenTime.Value.TotalMinutes;
        var em = (int)row.CloseTime.Value.TotalMinutes;
        if (em <= sm) return null;

        var dayStart = new DateTimeOffset(calendarDay.Year, calendarDay.Month, calendarDay.Day, 0, 0, 0, zone);
        return (dayStart.AddMinutes(sm), dayStart.AddMinutes(em));
    }

    /// <summary>
    /// Check if the given date falls within the booking window.
    /// Customers can book for the current week + next week (next week opens on the configured day).
    /// </summary>
    private static bool IsWithinBookingWindow(DateOnly targetDay, DateOnly today, int nextWeekOpensOnDay)
    {
        if (targetDay < today) return false;

        // Current week is always bookable
        // Next week becomes bookable once today >= the configured "opens on" day
        var todayDow = (int)today.DayOfWeek; // 0=Sun..6=Sat
        var daysUntilEndOfCurrentWeek = (7 - todayDow) % 7;
        var endOfCurrentWeek = today.AddDays(daysUntilEndOfCurrentWeek == 0 ? 7 : daysUntilEndOfCurrentWeek);

        // If target is within current week, always allow
        if (targetDay < endOfCurrentWeek) return true;

        // Next week: only allow if today >= nextWeekOpensOnDay
        var endOfNextWeek = endOfCurrentWeek.AddDays(7);
        if (targetDay < endOfNextWeek && todayDow >= nextWeekOpensOnDay)
            return true;

        // Beyond next week: not bookable
        return false;
    }

    /// <summary>Check if a branch has a closure covering the given calendar day.</summary>
    private async Task<bool> IsBranchClosedOnAsync(Guid branchId, DateOnly calendarDay, TimeSpan zone, CancellationToken ct)
    {
        var dayStart = new DateTimeOffset(calendarDay.Year, calendarDay.Month, calendarDay.Day, 0, 0, 0, zone);
        var dayEnd = dayStart.AddDays(1);

        return await db.BranchClosures.AsNoTracking()
            .AnyAsync(c => c.BranchId == branchId && c.ClosedFrom < dayEnd && c.ClosedTo >= dayStart, ct);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────────────────────────────────────

public sealed record SlotDto(
    string SlotStart, string SlotEnd,
    int OnlineUsed, int OnlineCapacity,
    string Status);

public sealed record BookingCreatedDto(
    Guid BookingId, string TicketNumber, string SlotStart, string SlotEnd, string ServiceName);

public sealed record WalkInCreatedDto(
    string TicketNumber, DateTimeOffset WalkInCapacitySlotStart, DateTimeOffset WalkInCapacitySlotEnd);

public sealed record QueueStatusDto(
    string TicketNumber, string State, int PeopleAhead, double? EstimatedWaitMinutes,
    string ServiceName, string? CurrentServingTicketNumber, string? NextEstimatedMessage,
    string? AssignedSlotStart, string? AssignedSlotEnd,
    int? CounterNumber, string? ServedAt);

public sealed record ServiceLaneSummaryDto(
    Guid ServiceTypeId, string ServiceName, int WaitingCount, double? EstimatedWaitMinutes, string CrowdLevel);

public sealed record CallNextDto(string? TicketNumber, int? CounterNumber, string? Message);

public sealed record MyCounterDto(
    int CounterNumber, string BranchName, string ServiceLaneName, string Mode,
    Guid BranchId, IReadOnlyList<Guid> AllowedServiceTypeIds,
    IReadOnlyList<string> ListenedQueueLabels);

public sealed record WaitingTicketDto(string TicketNumber, string EntryType, int Position, double? EstimatedWaitMinutes, string? ServiceName = null, bool CheckedIn = false);

public sealed record ManagerCounterRowDto(
    Guid Id, int Number, string Mode, string? AssignedStaffEmail, string AllowedLanesDisplay,
    IReadOnlyList<Guid> AllowedServiceTypeIds, Guid? CurrentDedicatedServiceTypeId, string? CurrentDedicatedLaneName,
    IReadOnlyList<string> ListenedQueueLabels);

public sealed record BranchOperationalSettingsDto(
    int SlotDurationMinutes, int ServiceZoneOffsetMinutes,
    int? MaxSlotTotalCapacity,
    int OnlineEarlyCallMinutes, int CalledAbsentGraceMinutes,
    int NextWeekBookingOpensOnDay,
    IReadOnlyList<BranchOperatingHourRow> WeeklyOperatingHours);

public sealed record AssignableStaffDto(Guid Id, string Email, string Name, string Role);

public sealed record ManagerWaitingTicketDto(
    Guid Id, string TicketNumber, string ServiceName, string EntryType,
    int Position, DateTimeOffset CreatedAt, DateTimeOffset? AssignedSlotStart,
    bool CheckedIn, double? EstimatedWaitMinutes);

public sealed record ManagerAppointmentsTodayDto(
    int TotalBookings, int CheckedIn, int Confirmed, int NoShow, int Cancelled,
    IReadOnlyList<ManagerAppointmentRowDto> Appointments);

public sealed record ManagerAppointmentRowDto(
    Guid BookingId, string CustomerName, string ServiceName,
    DateTimeOffset SlotStart, DateTimeOffset SlotEnd, string Status);
public sealed record ManagerInsightAlertDto(string Severity, string Message);

public sealed record ManagerLaneAnalyticsDto(
    Guid ServiceTypeId, string ServiceName, int WaitingCount, int ActiveCountersForLane,
    double? EstimatedWaitMinutes, double AvgServiceMinutesObserved, int CompletedToday,
    int? NextWindowOnlineCapacity, int? NextWindowWalkCapacity, string? NextWindowSlotStartIso);

public sealed record ManagerSuggestionDto(
    string Kind, string Title, string Detail,
    Guid? RelatedServiceTypeId, int? RelatedCounterNumber, Guid? RelatedCounterId);

public sealed record ManagerInsightsDto(
    IReadOnlyList<ManagerInsightAlertDto> Alerts,
    IReadOnlyList<ManagerSuggestionDto> Suggestions,
    IReadOnlyList<ManagerLaneAnalyticsDto> Lanes,
    int MissedToday);

public sealed record HourlyCountDto(string HourLabel, int Count);
public sealed record WaitBucketDto(string Label, int Count);
public sealed record TimingSummaryDto(
    double AvgMinutes,
    double? MedianMinutes,
    double? LongestMinutes,
    int? SlaMetCount,
    int? SlaExceededCount);
public sealed record TicketStatusSummaryDto(
    int TicketsToday,
    int Served,
    int Waiting,
    int Serving,
    int NoShow,
    int Cancelled);
public sealed record ChannelAnalyticsDto(
    int Tickets,
    int Served,
    int NoShows,
    double? NoShowRatePercent,
    double? AvgTicketToCallMinutes);
public sealed record OperationalPeakDto(
    string PeriodLabel,
    int TicketCount,
    double? AboveAveragePercent,
    string? TopServiceName,
    int ActiveCounters,
    int TotalCounters);
public sealed record CounterUtilizationRowDto(
    Guid CounterId,
    int CounterNumber,
    string? StaffEmail,
    string Mode,
    int ServedToday,
    double UtilizationPercent);
public sealed record LanePerformanceDto(
    Guid ServiceTypeId,
    string ServiceName,
    int Served,
    double? AvgTicketToCallMinutes,
    double? MaxTicketToCallMinutes,
    double? AvgServiceMinutes,
    double? TicketToCallSlaPercent);

public sealed record QueuePerformanceDto(
    Guid QueueId,
    string Name,
    string TicketPrefix,
    int Waiting,
    int Serving,
    int ServedToday,
    double? AvgTicketToCallMinutes,
    int SlaBreachWaiting,
    int ServiceLevelMinutes);

public sealed record BranchAnalyticsTodayDto(
    int TicketsToday,
    int CustomersServed,
    TimingSummaryDto TicketToCall,
    TimingSummaryDto ServiceDuration,
    double? TicketToCallSlaPercent,
    double SlaTargetMinutes,
    TicketStatusSummaryDto TicketStatus,
    ChannelAnalyticsDto WalkIn,
    ChannelAnalyticsDto Online,
    IReadOnlyList<HourlyCountDto> TicketsByHour,
    OperationalPeakDto? Peak,
    IReadOnlyList<WaitBucketDto> TicketToCallDistribution,
    IReadOnlyList<LanePerformanceDto> LanePerformance,
    IReadOnlyList<CounterUtilizationRowDto> CounterUtilization,
    IReadOnlyList<HourlyCountDto> NoShowsByHour,
    IReadOnlyList<QueuePerformanceDto> QueuePerformance);

public sealed record BranchQueueDto(
    Guid Id,
    string Name,
    string TicketPrefix,
    int ServiceLevelMinutes,
    bool IsActive,
    int WaitingCount,
    int ServingCount,
    double? LongestWaitMinutes,
    int SlaBreachCount,
    IReadOnlyList<string> ServiceNames,
    IReadOnlyList<Guid> ServiceTypeIds);

public sealed record TransferTicketDto(
    string PreviousTicketNumber,
    string NewTicketNumber,
    string TargetServiceName,
    string TicketPrefix);
