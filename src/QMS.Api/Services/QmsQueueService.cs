using System.Globalization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using QMS.Api.Hubs;
using QMS.Api.Dtos;
using QMS.Application.Capacity;
using QMS.Application.Geo;
using QMS.Application.Queue;
using QMS.Application.Waiting;
using QMS.Domain.Entities;
using QMS.Domain.Enums;
using QMS.Infrastructure.Bds;
using QMS.Infrastructure.Dispatch;
using QMS.Infrastructure.Persistence;

namespace QMS.Api.Services;

public sealed class QmsQueueService(
    QmsDbContext db,
    ICapacityEngine capacityEngine,
    IDispatchRoundStateStore dispatchRound,
    IHubContext<QueueHub> hubContext,
    IBdsReportingBridge bds)
{
    public async Task<IReadOnlyList<SlotDto>> GetSlotsAsync(
        Guid branchId,
        Guid serviceTypeId,
        DateOnly calendarDay,
        CancellationToken cancellationToken = default)
    {
        var branch = await db.Branches.AsNoTracking().FirstOrDefaultAsync(b => b.Id == branchId, cancellationToken)
                     ?? throw new InvalidOperationException("Branch not found");
        var service = await db.ServiceTypes.AsNoTracking().FirstOrDefaultAsync(
                          s => s.Id == serviceTypeId && s.BranchId == branchId, cancellationToken)
                      ?? throw new InvalidOperationException("Service not found");

        var slotMinutes = branch.SlotDurationMinutes < 1 ? 30 : branch.SlotDurationMinutes;

        var zone = TimeSpan.FromMinutes(branch.ServiceZoneOffsetMinutes);
        var nowAtBranch = DateTimeOffset.UtcNow.ToOffset(zone);
        var todayInBranch = DateOnly.FromDateTime(nowAtBranch.Date);

        if (calendarDay < todayInBranch)
            return Array.Empty<SlotDto>();

        var window = await GetBranchLocalServiceWindowAsync(branch.Id, calendarDay, zone, cancellationToken);
        if (window is null)
            return Array.Empty<SlotDto>();
        var (windowStart, windowEnd) = window.Value;

        var activeCounters = await CountActiveLaneCountersAsync(branchId, serviceTypeId, cancellationToken);

        var slots = new List<SlotDto>();
        var hidePastSlotsForToday = calendarDay == todayInBranch;

        // Fixed slot windows: uniform steps from operating-hours window + SlotDurationMinutes.
        for (var t = windowStart; t < windowEnd; t = t.AddMinutes(slotMinutes))
        {
            var slotStart = t;
            var slotEnd = t.AddMinutes(slotMinutes);

            if (hidePastSlotsForToday && slotEnd <= nowAtBranch)
                continue;

            var onlineUsed = await CountActiveOnlineBookingsForSlotAsync(
                branchId, serviceTypeId, slotStart, slotEnd, null, cancellationToken);

            var walkInUsed = await CountWalkInsAssignedToBucketAsync(
                branchId, serviceTypeId, slotStart, slotEnd, cancellationToken);

            var eff = ComputeEffectiveSlotCapacity(branch, service, activeCounters);
            var onlineCap = eff.OnlineCapacity;
            var walkCap = eff.WalkInBufferCapacity;

            string status;
            if (onlineUsed >= onlineCap) status = "Full";
            else if (onlineUsed >= (int)(onlineCap * 0.85)) status = "Limited";
            else status = "Available";

            slots.Add(new SlotDto(
                FormatIsoOffset(slotStart),
                FormatIsoOffset(slotEnd),
                onlineUsed,
                onlineCap,
                walkInUsed,
                walkCap,
                status));
        }

        return slots;
    }

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

        var zone = TimeSpan.FromMinutes(branch.ServiceZoneOffsetMinutes);
        var nowAtBranch = DateTimeOffset.UtcNow.ToOffset(zone);
        if (slotEnd <= nowAtBranch)
            throw new InvalidOperationException("This time slot is no longer available (it is in the past).");

        var slotStartZ = slotStart.ToOffset(zone);
        var slotEndZ = slotEnd.ToOffset(zone);
        var bookingDay = DateOnly.FromDateTime(slotStartZ.DateTime);
        var serviceWindow = await GetBranchLocalServiceWindowAsync(branch.Id, bookingDay, zone, cancellationToken);
        if (serviceWindow is null)
            throw new InvalidOperationException("The branch is not open for booking on this day.");
        var (serviceWindowStart, serviceWindowEnd) = serviceWindow.Value;
        if (slotStartZ < serviceWindowStart || slotEndZ > serviceWindowEnd)
            throw new InvalidOperationException("This time slot is outside branch service hours.");

        var activeCounters = await CountActiveLaneCountersAsync(branchId, serviceTypeId, cancellationToken);

        var onlineUsed = await CountActiveOnlineBookingsForSlotAsync(
            branchId, serviceTypeId, slotStart, slotEnd, null, cancellationToken);

        var eff = ComputeEffectiveSlotCapacity(branch, service, activeCounters);
        var onlineCap = eff.OnlineCapacity;

        if (onlineUsed >= onlineCap)
            throw new InvalidOperationException("Online capacity for this slot is full.");

        var seq = await AllocateLaneEnqueueSequenceForSlotAsync(branchId, serviceTypeId, slotStart, cancellationToken);
        var ticket = FormatTicket(branch.BranchCode, seq);

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
            TicketNumber = ticket,
            EntryType = QueueEntryType.OnlineBooked,
            State = QueueEntryState.Waiting,
            BookingId = booking.Id,
            EnqueueSequence = seq
        };

        booking.QueueEntry = entry;

        db.Bookings.Add(booking);
        await db.SaveChangesAsync(cancellationToken);

        await bds.OnTicketIssuedAsync(branch.BranchCode, ticket, entry.CreatedAt, service.Code, cancellationToken);

        await hubContext.Clients.Group(QueueHub.BranchGroup(branchId)).SendAsync("QueueUpdated", branchId, cancellationToken);

        return new BookingCreatedDto(booking.Id, ticket, FormatIsoOffset(slotStart), FormatIsoOffset(slotEnd), service.Name);
    }

    public async Task<WalkInCreatedDto> WalkInAsync(Guid branchId, Guid serviceTypeId, CancellationToken cancellationToken = default)
    {
        var branch = await db.Branches.FirstOrDefaultAsync(b => b.Id == branchId, cancellationToken)
                     ?? throw new InvalidOperationException("Branch not found");
        var service = await db.ServiceTypes.FirstOrDefaultAsync(
                          s => s.Id == serviceTypeId && s.BranchId == branchId, cancellationToken)
                      ?? throw new InvalidOperationException("Service not found");

        var zone = TimeSpan.FromMinutes(branch.ServiceZoneOffsetMinutes);
        var nowAtBranch = DateTimeOffset.UtcNow.ToOffset(zone);
        var dayStart = new DateTimeOffset(nowAtBranch.Year, nowAtBranch.Month, nowAtBranch.Day, 0, 0, 0, zone);
        var todayLocal = DateOnly.FromDateTime(nowAtBranch.DateTime);
        var todayWindow = await GetBranchLocalServiceWindowAsync(branch.Id, todayLocal, zone, cancellationToken);
        if (todayWindow is null)
            throw new InvalidOperationException("Branch is closed today.");
        var (windowStart, windowEnd) = todayWindow.Value;

        if (nowAtBranch >= windowEnd)
            throw new InvalidOperationException("Branch service hours have ended for today.");

        var slotM = branch.SlotDurationMinutes < 1 ? 30 : branch.SlotDurationMinutes;

        var aligned = AlignSlot(nowAtBranch, slotM);
        var firstBucket = aligned < windowStart ? windowStart : aligned;
        if (firstBucket >= windowEnd)
            throw new InvalidOperationException("No walk-in service window remains today.");

        var activeCounters = await CountActiveLaneCountersAsync(branchId, serviceTypeId, cancellationToken);

        DateTimeOffset? chosenStart = null;
        DateTimeOffset? chosenEnd = null;
        for (var b = firstBucket; b < windowEnd; b = b.AddMinutes(slotM))
        {
            var be = b.AddMinutes(slotM);
            var eff = ComputeEffectiveSlotCapacity(branch, service, activeCounters);
            var walkCap = eff.WalkInBufferCapacity;
            var used = await CountWalkInsAssignedToBucketAsync(branchId, serviceTypeId, b, be, cancellationToken);
            if (used < walkCap)
            {
                chosenStart = b;
                chosenEnd = be;
                break;
            }
        }

        if (chosenStart is null || chosenEnd is null)
            throw new InvalidOperationException("Walk-in buffers are full for all remaining slots today.");

        var seq = await AllocateLaneEnqueueSequenceForSlotAsync(branchId, serviceTypeId, chosenStart.Value, cancellationToken);
        var ticket = FormatTicket(branch.BranchCode, seq);

        var entry = new QueueEntry
        {
            Id = Guid.NewGuid(),
            BranchId = branchId,
            ServiceTypeId = serviceTypeId,
            TicketNumber = ticket,
            EntryType = QueueEntryType.WalkIn,
            State = QueueEntryState.Waiting,
            EnqueueSequence = seq,
            WalkInCapacityBucketStart = chosenStart,
            WalkInCapacityBucketEnd = chosenEnd
        };

        db.QueueEntries.Add(entry);
        await db.SaveChangesAsync(cancellationToken);

        await bds.OnTicketIssuedAsync(branch.BranchCode, ticket, entry.CreatedAt, service.Code, cancellationToken);

        await hubContext.Clients.Group(QueueHub.BranchGroup(branchId)).SendAsync("QueueUpdated", branchId, cancellationToken);
        return new WalkInCreatedDto(ticket, chosenStart.Value, chosenEnd.Value);
    }

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
        if (booking.QueueEntry is not null) booking.QueueEntry.EntryType = QueueEntryType.OnlineBooked;

        await db.SaveChangesAsync(cancellationToken);
        await hubContext.Clients.Group(QueueHub.BranchGroup(booking.BranchId)).SendAsync("QueueUpdated", booking.BranchId, cancellationToken);
    }

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

        if (booking.Status is BookingStatus.Cancelled or BookingStatus.Completed or BookingStatus.NoShow)
            throw new InvalidOperationException("This booking cannot be rescheduled.");

        var branch = booking.Branch;
        var service = booking.ServiceType;

        var zone = TimeSpan.FromMinutes(branch.ServiceZoneOffsetMinutes);
        var nowAtBranch = DateTimeOffset.UtcNow.ToOffset(zone);
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

        var activeCounters = await CountActiveLaneCountersAsync(booking.BranchId, booking.ServiceTypeId, cancellationToken);

        var onlineUsed = await CountActiveOnlineBookingsForSlotAsync(
            booking.BranchId,
            booking.ServiceTypeId,
            newSlotStart,
            newSlotEnd,
            bookingId,
            cancellationToken);

        var eff = ComputeEffectiveSlotCapacity(branch, service, activeCounters);
        var onlineCap = eff.OnlineCapacity;

        if (onlineUsed >= onlineCap)
            throw new InvalidOperationException("Online capacity for the new slot is full.");

        booking.SlotStart = newSlotStart;
        booking.SlotEnd = newSlotEnd;

        if (booking.QueueEntry is { State: QueueEntryState.Waiting })
        {
            booking.QueueEntry.EnqueueSequence = await AllocateLaneEnqueueSequenceForSlotAsync(
                booking.BranchId,
                booking.ServiceTypeId,
                newSlotStart,
                cancellationToken);
        }

        await db.SaveChangesAsync(cancellationToken);
        await hubContext.Clients.Group(QueueHub.BranchGroup(booking.BranchId)).SendAsync("QueueUpdated", booking.BranchId, cancellationToken);
    }

    public async Task CancelBookingAsync(Guid userId, Guid bookingId, CancellationToken cancellationToken = default)
    {
        var booking = await db.Bookings.Include(b => b.QueueEntry)
            .FirstOrDefaultAsync(b => b.Id == bookingId && b.CustomerId == userId, cancellationToken)
            ?? throw new InvalidOperationException("Booking not found");

        booking.Status = BookingStatus.Cancelled;
        if (booking.QueueEntry is not null)
        {
            booking.QueueEntry.State = QueueEntryState.Absent;
        }

        await db.SaveChangesAsync(cancellationToken);
        await hubContext.Clients.Group(QueueHub.BranchGroup(booking.BranchId)).SendAsync("QueueUpdated", booking.BranchId, cancellationToken);
    }

    public async Task<QueueStatusDto?> GetQueueStatusAsync(
        Guid branchId,
        string ticketNumber,
        CancellationToken cancellationToken = default)
    {
        var entry = await db.QueueEntries.AsNoTracking()
            .Include(q => q.ServiceType)
            .FirstOrDefaultAsync(q => q.BranchId == branchId && q.TicketNumber == ticketNumber, cancellationToken);
        if (entry is null) return null;

        var activeCounters = await CountActiveLaneCountersAsync(branchId, entry.ServiceTypeId, cancellationToken);

        var waitingAhead = await db.QueueEntries.AsNoTracking().CountAsync(
            q => q.BranchId == branchId && q.ServiceTypeId == entry.ServiceTypeId && q.State == QueueEntryState.Waiting
                                              && q.EnqueueSequence < entry.EnqueueSequence,
            cancellationToken);

        var avg = entry.ServiceType.DefaultAvgServiceMinutes;
        var eta = WaitTimeEstimator.EstimateMinutes(waitingAhead, avg, Math.Max(1, activeCounters));

        var currentServing = await db.QueueEntries.AsNoTracking()
            .Where(q => q.BranchId == branchId && q.ServiceTypeId == entry.ServiceTypeId && q.State == QueueEntryState.Serving)
            .OrderBy(q => q.ServingStartedAt)
            .Select(q => q.TicketNumber)
            .FirstOrDefaultAsync(cancellationToken);

        string? nextMsg = null;
        if (entry.State == QueueEntryState.Waiting)
        {
            if (waitingAhead == 0)
            {
                var mins = double.IsInfinity(eta) ? avg : eta;
                if (mins is double m && !double.IsInfinity(m) && m > 0)
                    nextMsg = $"You are next in ~{Math.Max(1, (int)Math.Round(m))} mins";
                else
                    nextMsg = "You are next";
            }
        }

        return new QueueStatusDto(
            entry.TicketNumber,
            entry.State.ToString(),
            waitingAhead,
            double.IsInfinity(eta) ? null : Math.Round(eta, 1),
            entry.ServiceType.Name,
            currentServing,
            nextMsg);
    }

    public async Task<CallNextDto> CallNextAsync(
        Guid staffId,
        Guid branchId,
        Guid serviceTypeId,
        CancellationToken cancellationToken = default)
    {
        var counter = await db.Counters
            .Include(c => c.Branch)
            .Include(c => c.AllowedServices)
            .FirstOrDefaultAsync(
                c => c.BranchId == branchId && c.StaffId == staffId, cancellationToken)
            ?? throw new InvalidOperationException("No counter assigned to this staff user.");

        if (!CounterCanServeLane(counter, serviceTypeId))
            throw new InvalidOperationException(
                "This counter is not enabled for this service lane. Pick the correct lane in the teller app or ask the manager to add this lane to your counter.");

        var laneId = serviceTypeId;

        var waiting = await db.QueueEntries
            .Include(q => q.Booking)
            .Where(q => q.BranchId == branchId && q.ServiceTypeId == laneId && q.State == QueueEntryState.Waiting)
            .OrderByDescending(q =>
                (q.EntryType == QueueEntryType.WalkIn || q.EntryType == QueueEntryType.LateDegraded)
                || (q.Booking != null && q.Booking.Status == BookingStatus.CheckedIn))
            .ThenBy(q => q.Booking != null ? q.Booking.SlotStart : DateTimeOffset.MaxValue)
            .ThenBy(q => q.EnqueueSequence)
            .ToListAsync(cancellationToken);

        if (waiting.Count == 0)
            return new CallNextDto(null, null, "No waiting customers.");

        var total = waiting.Count;
        var walk = waiting.Count(q => q.EntryType == QueueEntryType.WalkIn || q.EntryType == QueueEntryType.LateDegraded);
        var ratio = total == 0 ? 0 : (double)walk / total;

        var streak = await dispatchRound.GetOnlineStreakAsync(branchId, laneId, cancellationToken);
        var (next, newStreak) = HybridDispatch.PickNext(waiting, streak, ratio);
        await dispatchRound.SetOnlineStreakAsync(branchId, laneId, newStreak, cancellationToken);

        if (next is null)
            return new CallNextDto(null, null, "Unable to select next customer.");

        next.State = QueueEntryState.Called;
        next.CalledAt = DateTimeOffset.UtcNow;
        next.CounterId = counter.Id;
        await db.SaveChangesAsync(cancellationToken);

        var staff = await db.StaffMembers.AsNoTracking().FirstOrDefaultAsync(u => u.Id == staffId, cancellationToken);
        await bds.OnTicketCalledAsync(
            counter.Branch.BranchCode,
            next.TicketNumber,
            counter.Number,
            ToBdsStaff10(staff),
            next.CalledAt!.Value,
            cancellationToken);

        await hubContext.Clients.Group(QueueHub.BranchGroup(branchId)).SendAsync("TicketCalled", next.TicketNumber, cancellationToken);

        return new CallNextDto(next.TicketNumber, counter.Number, null);
    }

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
        entry.State = QueueEntryState.Done;
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
        {
            entry.Booking.Status = BookingStatus.Completed;
        }

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
    }

    public async Task<MyCounterDto> GetMyCounterAsync(Guid staffId, CancellationToken cancellationToken = default)
    {
        var c = await db.Counters
            .AsNoTracking()
            .Include(x => x.Branch)
            .Include(x => x.AllowedServices)
            .ThenInclude(a => a.ServiceType)
            .FirstOrDefaultAsync(x => x.StaffId == staffId, cancellationToken)
            ?? throw new InvalidOperationException("No counter assigned to this staff user.");

        var lane = c.AllowedServices.Count == 0
            ? "General (all lanes)"
            : string.Join(", ", c.AllowedServices.Select(a => a.ServiceType.Name));
        var ids = c.AllowedServices.Select(a => a.ServiceTypeId).ToList();
        return new MyCounterDto(c.Number, c.Branch.Name, lane, c.Mode.ToString(), c.BranchId, ids);
    }

    public async Task<IReadOnlyList<WaitingTicketDto>> ListWaitingTicketsAsync(
        Guid branchId,
        Guid serviceTypeId,
        CancellationToken cancellationToken = default)
    {
        var active = await CountActiveLaneCountersAsync(branchId, serviceTypeId, cancellationToken);
        var n = Math.Max(1, active);

        var svc = await db.ServiceTypes.AsNoTracking().FirstOrDefaultAsync(
                      s => s.Id == serviceTypeId && s.BranchId == branchId,
                      cancellationToken)
                  ?? throw new InvalidOperationException("Service not found.");

        var list = await db.QueueEntries.AsNoTracking()
            .Where(q => q.BranchId == branchId && q.ServiceTypeId == serviceTypeId && q.State == QueueEntryState.Waiting)
            .OrderBy(q => q.EnqueueSequence)
            .ToListAsync(cancellationToken);

        var result = new List<WaitingTicketDto>();
        var position = 1;
        foreach (var q in list)
        {
            var ahead = position - 1;
            var eta = WaitTimeEstimator.EstimateMinutes(ahead, svc.DefaultAvgServiceMinutes, n);
            result.Add(new WaitingTicketDto(
                q.TicketNumber,
                q.EntryType.ToString(),
                position,
                double.IsInfinity(eta) ? null : Math.Round(eta, 1)));
            position++;
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
            .Include(c => c.CurrentServiceType)
            .Where(c => c.BranchId == branchId)
            .OrderBy(c => c.Number)
            .ToListAsync(cancellationToken);

        return rows
            .Select(c =>
            {
                var ids = c.AllowedServices.Select(a => a.ServiceTypeId).ToList();
                var display = c.AllowedServices.Count == 0
                    ? "General (all lanes)"
                    : string.Join(", ", c.AllowedServices.Select(a => a.ServiceType.Name));
                return new ManagerCounterRowDto(
                    c.Id,
                    c.Number,
                    c.Mode.ToString(),
                    c.AssignedStaff?.Email,
                    display,
                    ids,
                    c.CurrentServiceTypeId,
                    c.CurrentServiceType?.Name);
            })
            .ToList();
    }

    public async Task SetCounterModeForManagerAsync(
        Guid branchId,
        Guid counterId,
        CounterMode mode,
        CancellationToken cancellationToken = default)
    {
        var counter = await db.Counters.FirstOrDefaultAsync(
                          c => c.Id == counterId && c.BranchId == branchId,
                          cancellationToken)
                      ?? throw new InvalidOperationException("Counter not found for this branch.");

        counter.Mode = mode;
        await db.SaveChangesAsync(cancellationToken);
        await hubContext.Clients.Group(QueueHub.BranchGroup(branchId)).SendAsync("CountersUpdated", branchId, cancellationToken);
    }

    public async Task SetCounterStaffForManagerAsync(
        Guid branchId,
        Guid counterId,
        Guid? staffId,
        CancellationToken cancellationToken = default)
    {
        var counter = await db.Counters.FirstOrDefaultAsync(
                          c => c.Id == counterId && c.BranchId == branchId,
                          cancellationToken)
                      ?? throw new InvalidOperationException("Counter not found for this branch.");

        if (staffId is null)
        {
            counter.StaffId = null;
        }
        else
        {
            var staffMember = await db.StaffMembers.AsNoTracking().FirstOrDefaultAsync(
                                  s => s.Id == staffId && s.BranchId == branchId,
                                  cancellationToken)
                              ?? throw new InvalidOperationException("Staff member not found for this branch.");
            var other = await db.Counters.FirstOrDefaultAsync(
                c => c.BranchId == branchId && c.Id != counterId && c.StaffId == staffId,
                cancellationToken);
            if (other is not null)
                other.StaffId = null;

            counter.StaffId = staffId;
        }

        await db.SaveChangesAsync(cancellationToken);
        await hubContext.Clients.Group(QueueHub.BranchGroup(branchId)).SendAsync("CountersUpdated", branchId, cancellationToken);
    }

    public async Task SetCounterAllowedServicesForManagerAsync(
        Guid branchId,
        Guid counterId,
        IReadOnlyList<Guid> serviceTypeIds,
        CancellationToken cancellationToken = default)
    {
        var counter = await db.Counters
                          .Include(c => c.AllowedServices)
                          .FirstOrDefaultAsync(c => c.Id == counterId && c.BranchId == branchId, cancellationToken)
                      ?? throw new InvalidOperationException("Counter not found for this branch.");

        var distinct = serviceTypeIds.Distinct().ToList();
        foreach (var sid in distinct)
        {
            var exists = await db.ServiceTypes.AnyAsync(
                s => s.Id == sid && s.BranchId == branchId,
                cancellationToken);
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
        Guid branchId,
        Guid counterId,
        Guid? dedicatedServiceTypeId,
        CancellationToken cancellationToken = default)
    {
        var counter = await db.Counters
                          .Include(c => c.AllowedServices)
                          .FirstOrDefaultAsync(c => c.Id == counterId && c.BranchId == branchId, cancellationToken)
                      ?? throw new InvalidOperationException("Counter not found for this branch.");

        if (dedicatedServiceTypeId is { } sid)
        {
            var exists = await db.ServiceTypes.AnyAsync(
                s => s.Id == sid && s.BranchId == branchId,
                cancellationToken);
            if (!exists)
                throw new InvalidOperationException("Service type is not valid for this branch.");

            if (counter.AllowedServices.Count > 0 && counter.AllowedServices.All(a => a.ServiceTypeId != sid))
                throw new InvalidOperationException(
                    "That lane is not in this counter’s allowed set. Add the lane under allowed lanes first, or clear lanes to use a General counter.");
        }

        counter.CurrentServiceTypeId = dedicatedServiceTypeId;
        await db.SaveChangesAsync(cancellationToken);
        await hubContext.Clients.Group(QueueHub.BranchGroup(branchId)).SendAsync("CountersUpdated", branchId, cancellationToken);
        await hubContext.Clients.Group(QueueHub.BranchGroup(branchId)).SendAsync("QueueUpdated", branchId, cancellationToken);
    }

    public async Task<BranchOperationalSettingsDto> GetBranchOperationalSettingsAsync(
        Guid branchId,
        CancellationToken cancellationToken = default)
    {
        var b = await db.Branches.AsNoTracking().FirstOrDefaultAsync(x => x.Id == branchId, cancellationToken)
                ?? throw new InvalidOperationException("Branch not found.");
        var hours = await db.BranchOperatingHours.AsNoTracking()
            .Where(h => h.BranchId == branchId)
            .ToListAsync(cancellationToken);
        var weekly = hours
            .OrderBy(h => DayOfWeekSortKey(h.DayOfWeek))
            .Select(h => new BranchOperatingHourRow(
                h.DayOfWeek,
                h.IsClosed,
                h.IsClosed ? null : (int?)h.OpenTime!.Value.TotalMinutes,
                h.IsClosed ? null : (int?)h.CloseTime!.Value.TotalMinutes))
            .ToList();
        return new BranchOperationalSettingsDto(
            b.OnlineQuotaPercent,
            100 - b.OnlineQuotaPercent,
            b.SlotDurationMinutes,
            b.ServiceZoneOffsetMinutes,
            b.AdaptiveSlotCapacityEnabled,
            b.MinSlotTotalCapacity,
            b.MaxCapacity,
            weekly);
    }

    public async Task UpdateBranchOperationalSettingsAsync(
        Guid branchId,
        int? onlineQuotaPercent,
        int? slotDurationMinutes,
        IReadOnlyList<BranchOperatingHourRow>? weeklyOperatingHours,
        bool? adaptiveSlotCapacityEnabled,
        int? minSlotTotalCapacity,
        int? maxSlotTotalCapacity,
        bool clearMinSlotTotalCapacity = false,
        bool clearMaxSlotTotalCapacity = false,
        CancellationToken cancellationToken = default)
    {
        var b = await db.Branches.FirstOrDefaultAsync(x => x.Id == branchId, cancellationToken)
                ?? throw new InvalidOperationException("Branch not found.");

        if (onlineQuotaPercent is int o)
            b.OnlineQuotaPercent = Math.Clamp(o, 0, 100);
        if (slotDurationMinutes is int sd)
            b.SlotDurationMinutes = Math.Clamp(sd, 5, 180);
        if (adaptiveSlotCapacityEnabled is bool adapt)
            b.AdaptiveSlotCapacityEnabled = adapt;

        if (clearMinSlotTotalCapacity)
            b.MinSlotTotalCapacity = null;
        else if (minSlotTotalCapacity is int mn)
            b.MinSlotTotalCapacity = Math.Max(0, mn);

        if (clearMaxSlotTotalCapacity)
            b.MaxCapacity = null;
        else if (maxSlotTotalCapacity is int mx)
            b.MaxCapacity = Math.Max(1, mx);

        if (b.MinSlotTotalCapacity is { } floor && b.MaxCapacity is { } cap && floor > cap)
            throw new InvalidOperationException("Min slot total capacity cannot exceed max slot total capacity.");

        if (weeklyOperatingHours is { Count: > 0 })
            await ReplaceBranchWeeklyOperatingHoursAsync(branchId, weeklyOperatingHours, cancellationToken);

        await db.SaveChangesAsync(cancellationToken);
        await hubContext.Clients.Group(QueueHub.BranchGroup(branchId)).SendAsync("QueueUpdated", branchId, cancellationToken);
        await hubContext.Clients.Group(QueueHub.BranchGroup(branchId)).SendAsync("CountersUpdated", branchId, cancellationToken);
    }

    public async Task<IReadOnlyList<AssignableStaffDto>> ListAssignableStaffAsync(CancellationToken cancellationToken = default) =>
        await db.StaffMembers.AsNoTracking()
            .Where(s => s.Role == StaffRoleKind.Staff || s.Role == StaffRoleKind.Manager)
            .OrderBy(s => s.Email)
            .Select(s => new AssignableStaffDto(s.Id, s.Email, s.Name, s.Role.ToString()))
            .ToListAsync(cancellationToken);

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
        if (counter.AllowedServices.Count == 0)
            return true;
        return counter.AllowedServices.Any(a => a.ServiceTypeId == laneServiceTypeId);
    }

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
        var dayStartLocal = new DateTimeOffset(nowAtBranch.Year, nowAtBranch.Month, nowAtBranch.Day, 0, 0, 0, zone);
        var todayLocal = DateOnly.FromDateTime(nowAtBranch.DateTime);
        DateTimeOffset nextStart;
        DateTimeOffset nextEnd;
        var validNextWindow = false;
        var todaySvcWindow = await GetBranchLocalServiceWindowAsync(branchEntity.Id, todayLocal, zone, cancellationToken);
        if (todaySvcWindow is { } tw)
        {
            var windowStart = tw.Start;
            var windowEnd = tw.End;
            nextStart = AlignSlot(nowAtBranch, slotMin);
            if (nextStart < windowStart)
                nextStart = windowStart;
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
            q => q.BranchId == branchId && q.State == QueueEntryState.Waiting,
            cancellationToken);
        var activeAll = await db.Counters.CountAsync(
            c => c.BranchId == branchId && c.Mode == CounterMode.Active,
            cancellationToken);

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
            .Where(s => s.BranchId == branchId)
            .OrderBy(s => s.Name)
            .ToListAsync(cancellationToken);

        var lanes = new List<ManagerLaneAnalyticsDto>();
        foreach (var svc in services)
        {
            var w = await db.QueueEntries.CountAsync(
                q => q.BranchId == branchId && q.ServiceTypeId == svc.Id && q.State == QueueEntryState.Waiting,
                cancellationToken);
            var ac = await CountActiveLaneCountersAsync(branchId, svc.Id, cancellationToken);
            var eta = WaitTimeEstimator.EstimateMinutes(w, svc.DefaultAvgServiceMinutes, Math.Max(1, ac));

            if (w > 0 && ac == 0)
                alerts.Add(new ManagerInsightAlertDto(
                    "warning",
                    $"Lane «{svc.Name}» has {w} waiting but no counter open for that lane (open a General counter or add this lane to a counter’s allowed set)."));

            if (!double.IsInfinity(eta) && eta > 30)
                alerts.Add(new ManagerInsightAlertDto(
                    "warning",
                    $"Lane «{svc.Name}» estimated wait ~{Math.Round(eta)} min (long wait)."));

            var avgNullable = await db.ServiceSessionLogs.AsNoTracking()
                .Where(l => l.ServiceTypeId == svc.Id)
                .AverageAsync(l => (double?)l.DurationSeconds, cancellationToken);
            var avgSec = avgNullable ?? 0.0;

            var completedToday = await db.ServiceSessionLogs.CountAsync(
                l => l.ServiceTypeId == svc.Id && l.EndedAt >= dayStartOffset && l.EndedAt < dayEndOffset,
                cancellationToken);

            EffectiveSlotCapacity? effNext = null;
            if (validNextWindow)
            {
                effNext = ComputeEffectiveSlotCapacity(branchEntity, svc, ac);
                var usedNext = await CountActiveOnlineBookingsForSlotAsync(
                    branchId,
                    svc.Id,
                    nextStart,
                    nextEnd,
                    null,
                    cancellationToken);
                if (branchEntity.AdaptiveSlotCapacityEnabled && usedNext > effNext.OnlineCapacity)
                {
                    alerts.Add(new ManagerInsightAlertDto(
                        "critical",
                        $"Adaptive booking pressure: lane «{svc.Name}» has {usedNext} active online bookings in the upcoming window ({FormatIsoOffset(nextStart)}) but only {effNext.OnlineCapacity} online seats with current counters."));
                }
            }

            lanes.Add(new ManagerLaneAnalyticsDto(
                svc.Id,
                svc.Name,
                w,
                ac,
                double.IsInfinity(eta) ? null : Math.Round(eta, 1),
                Math.Round(avgSec / 60.0, 2),
                completedToday,
                effNext?.OnlineCapacity,
                effNext?.WalkInBufferCapacity,
                effNext != null ? FormatIsoOffset(nextStart) : null));

            if (w > 0 && ac == 0)
            {
                var candidate = counters.FirstOrDefault(c => c.Mode != CounterMode.Active && CounterCanServeLane(c, svc.Id));
                if (candidate != null)
                {
                    suggestions.Add(new ManagerSuggestionDto(
                        "open_counter",
                        $"Open counter #{candidate.Number}",
                        $"Lane «{svc.Name}» has {w} waiting. Counter #{candidate.Number} can serve this lane once set to Active.",
                        svc.Id,
                        candidate.Number,
                        candidate.Id));
                }
                else
                {
                    var closedOnly = counters.Where(c => c.Mode == CounterMode.Closed).OrderBy(c => c.Number).FirstOrDefault();
                    if (closedOnly != null)
                    {
                        suggestions.Add(new ManagerSuggestionDto(
                            "add_lane_then_open",
                            $"Review counter #{closedOnly.Number}",
                            $"Lane «{svc.Name}» has {w} waiting but no idle counter is configured for that lane. Add the lane to a counter’s allowed set (or use a General counter) then open it.",
                            svc.Id,
                            closedOnly.Number,
                            closedOnly.Id));
                    }
                }
            }
            else if (w >= 8 && ac <= 1)
            {
                var onBreak = counters.FirstOrDefault(c => c.Mode == CounterMode.Break && CounterCanServeLane(c, svc.Id));
                if (onBreak != null)
                {
                    suggestions.Add(new ManagerSuggestionDto(
                        "end_break",
                        $"Consider ending break · counter #{onBreak.Number}",
                        $"Lane «{svc.Name}» is deep ({w} waiting) with only {ac} active counter(s). Counter #{onBreak.Number} can reopen for this lane.",
                        svc.Id,
                        onBreak.Number,
                        onBreak.Id));
                }
            }
        }

        if (branchEntity.AdaptiveSlotCapacityEnabled && suggestions.Count == 0 && waitingTotal > 5 && activeAll < counters.Count)
        {
            suggestions.Add(new ManagerSuggestionDto(
                "adaptive_tip",
                "Adaptive slot capacity is on",
                "Online booking caps are computed from open counters, slot length, service duration, and optional min/max totals. Opening or closing counters changes how many seats appear in the booking grid after refresh.",
                null,
                null,
                null));
        }

        var noShowsToday = await db.Bookings.CountAsync(
            b => b.BranchId == branchId
                 && b.Status == BookingStatus.NoShow
                 && b.SlotEnd >= dayStartOffset
                 && b.SlotEnd < dayEndOffset,
            cancellationToken);

        return new ManagerInsightsDto(
            alerts.DistinctBy(a => a.Message).ToList(),
            suggestions.DistinctBy(s => s.Title + "|" + s.Detail).Take(12).ToList(),
            lanes,
            noShowsToday);
    }

    public async Task<ServiceLaneSummaryDto> GetServiceLaneSummaryAsync(
        Guid branchId,
        Guid serviceTypeId,
        CancellationToken cancellationToken = default)
    {
        var svc = await db.ServiceTypes.AsNoTracking().FirstOrDefaultAsync(
                      s => s.Id == serviceTypeId && s.BranchId == branchId,
                      cancellationToken)
                  ?? throw new InvalidOperationException("Service not found.");

        var waiting = await db.QueueEntries.CountAsync(
            q => q.BranchId == branchId && q.ServiceTypeId == serviceTypeId && q.State == QueueEntryState.Waiting,
            cancellationToken);

        var active = await CountActiveLaneCountersAsync(branchId, serviceTypeId, cancellationToken);
        var n = Math.Max(1, active);
        var eta = WaitTimeEstimator.EstimateMinutes(waiting, svc.DefaultAvgServiceMinutes, n);

        var crowd = waiting switch
        {
            < 5 => "Low",
            < 15 => "Medium",
            _ => "High"
        };

        return new ServiceLaneSummaryDto(
            serviceTypeId,
            svc.Name,
            waiting,
            double.IsInfinity(eta) ? null : Math.Round(eta, 1),
            crowd);
    }

    private static DateTimeOffset AlignSlot(DateTimeOffset now, int slotMinutes)
    {
        var minutes = now.Hour * 60 + now.Minute;
        var aligned = minutes / slotMinutes * slotMinutes;
        return new DateTimeOffset(now.Year, now.Month, now.Day, 0, 0, 0, now.Offset).AddMinutes(aligned);
    }

    private static string ToBdsStaff10(Staff? staff)
    {
        if (staff?.Email is not { Length: > 0 } email)
            return "UNKNOWN";
        return email.Length <= 10 ? email : email[..10];
    }

    private static string FormatTicket(int branchCode, long seq) => $"{branchCode}-{seq:0000}";

    /// <summary>ISO-8601 with 3-digit fractional seconds (JavaScript-friendly; avoids Hermes issues with "O" 7-digit ticks).</summary>
    private static string FormatIsoOffset(DateTimeOffset value) =>
        value.ToString("yyyy-MM-dd'T'HH:mm:ss.fffzzz", CultureInfo.InvariantCulture);

    /// <summary>
    /// Earlier appointment windows get lower <see cref="QueueEntry.EnqueueSequence"/> than later ones
    /// (same branch + lane), so “people ahead” and waiting lists match real slot order—not booking order.
    /// </summary>
    private async Task<long> AllocateLaneEnqueueSequenceForSlotAsync(
        Guid branchId,
        Guid serviceTypeId,
        DateTimeOffset slotStart,
        CancellationToken cancellationToken)
    {
        const long bucket = 10_000L;
        var floor = slotStart.ToUnixTimeSeconds() * bucket;
        var cap = floor + bucket - 1;

        var maxInBucket = await db.QueueEntries
            .Where(q => q.BranchId == branchId && q.ServiceTypeId == serviceTypeId && q.State == QueueEntryState.Waiting)
            .Where(q => q.EnqueueSequence >= floor && q.EnqueueSequence <= cap)
            .MaxAsync(q => (long?)q.EnqueueSequence, cancellationToken);

        var next = maxInBucket is null ? floor : maxInBucket.Value + 1;
        if (next > cap)
            throw new InvalidOperationException("Too many customers in this time bucket; try again.");
        return next;
    }

    /// <summary>Tickets issued against a walk-in buffer for a fixed service window (includes overflow from earlier windows).</summary>
    private async Task<int> CountActiveOnlineBookingsForSlotAsync(
        Guid branchId,
        Guid serviceTypeId,
        DateTimeOffset slotStart,
        DateTimeOffset slotEnd,
        Guid? excludeBookingId,
        CancellationToken cancellationToken)
    {
        return await db.Bookings.CountAsync(
            b => (!excludeBookingId.HasValue || b.Id != excludeBookingId.Value)
                 && b.BranchId == branchId && b.ServiceTypeId == serviceTypeId
                 && (b.Status == BookingStatus.Pending || b.Status == BookingStatus.Confirmed || b.Status == BookingStatus.CheckedIn)
                 && b.SlotStart < slotEnd && b.SlotEnd > slotStart,
            cancellationToken);
    }

    private async Task<int> CountWalkInsAssignedToBucketAsync(
        Guid branchId,
        Guid serviceTypeId,
        DateTimeOffset bucketStart,
        DateTimeOffset bucketEnd,
        CancellationToken cancellationToken)
    {
        return await db.QueueEntries.CountAsync(
            q => q.BranchId == branchId
                 && q.ServiceTypeId == serviceTypeId
                 && (q.EntryType == QueueEntryType.WalkIn || q.EntryType == QueueEntryType.LateDegraded)
                 && (
                     (q.WalkInCapacityBucketStart != null && q.WalkInCapacityBucketEnd != null
                      && q.WalkInCapacityBucketStart == bucketStart && q.WalkInCapacityBucketEnd == bucketEnd)
                     || (q.WalkInCapacityBucketStart == null && q.CreatedAt >= bucketStart && q.CreatedAt < bucketEnd)
                 ),
            cancellationToken);
    }

    /// <summary>
    /// Local service window for <paramref name="calendarDay"/> from <c>BRANCH_OPERATING_HOURS</c> for that weekday (branch timezone used only for constructing instants).
    /// </summary>
    private async Task<(DateTimeOffset Start, DateTimeOffset End)?> GetBranchLocalServiceWindowAsync(
        Guid branchId,
        DateOnly calendarDay,
        TimeSpan zone,
        CancellationToken cancellationToken)
    {
        var dowName = calendarDay.DayOfWeek.ToString();
        var row = await db.BranchOperatingHours.AsNoTracking()
            .Where(h => h.BranchId == branchId && h.DayOfWeek == dowName)
            .FirstOrDefaultAsync(cancellationToken);
        if (row is null || row.IsClosed || row.OpenTime is null || row.CloseTime is null)
            return null;

        var sm = (int)row.OpenTime.Value.TotalMinutes;
        var em = (int)row.CloseTime.Value.TotalMinutes;
        if (em <= sm)
            return null;

        var dayStart = new DateTimeOffset(calendarDay.Year, calendarDay.Month, calendarDay.Day, 0, 0, 0, zone);
        return (dayStart.AddMinutes(sm), dayStart.AddMinutes(em));
    }

    private static int DayOfWeekSortKey(string dayOfWeek) =>
        dayOfWeek switch
        {
            "Monday" => 0,
            "Tuesday" => 1,
            "Wednesday" => 2,
            "Thursday" => 3,
            "Friday" => 4,
            "Saturday" => 5,
            "Sunday" => 6,
            _ => 99,
        };

    private async Task ReplaceBranchWeeklyOperatingHoursAsync(
        Guid branchId,
        IReadOnlyList<BranchOperatingHourRow> rows,
        CancellationToken cancellationToken)
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
            if (r.IsClosed)
                continue;
            if (r.OpenMinutesFromMidnight is null || r.CloseMinutesFromMidnight is null)
                throw new InvalidOperationException($"Open and close minutes are required when {r.DayOfWeek} is not closed.");
            var openM = r.OpenMinutesFromMidnight.Value;
            var closeMin = r.CloseMinutesFromMidnight.Value;
            if (openM < 0 || closeMin > 24 * 60 || openM >= closeMin)
                throw new InvalidOperationException(
                    $"Invalid open/close for {r.DayOfWeek}: use minutes from midnight with 0 ≤ open < close ≤ 1440.");
        }

        if (seen.Count != 7 || !seen.SetEquals(
                new[] { "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday" }))
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

    private EffectiveSlotCapacity ComputeEffectiveSlotCapacity(
        Branch branch,
        ServiceType service,
        int activeCounters)
    {
        var slotMinutes = branch.SlotDurationMinutes < 1 ? 30 : branch.SlotDurationMinutes;
        var planCounters = Math.Max(1, activeCounters);
        var dynamicPlan = capacityEngine.Compute(
            slotMinutes,
            service.DefaultAvgServiceMinutes,
            planCounters,
            branch.OnlineQuotaPercent);
        return AdaptiveSlotCapacity.Resolve(
            dynamicPlan,
            branch.MinSlotTotalCapacity,
            branch.MaxCapacity,
            branch.OnlineQuotaPercent);
    }
}

public sealed record SlotDto(
    string SlotStart,
    string SlotEnd,
    int OnlineUsed,
    int OnlineCapacity,
    int WalkInUsed,
    int WalkInCapacity,
    string Status);

public sealed record BookingCreatedDto(
    Guid BookingId,
    string TicketNumber,
    string SlotStart,
    string SlotEnd,
    string ServiceName);

public sealed record WalkInCreatedDto(
    string TicketNumber,
    DateTimeOffset WalkInCapacitySlotStart,
    DateTimeOffset WalkInCapacitySlotEnd);

public sealed record QueueStatusDto(
    string TicketNumber,
    string State,
    int PeopleAhead,
    double? EstimatedWaitMinutes,
    string ServiceName,
    string? CurrentServingTicketNumber,
    string? NextEstimatedMessage);

public sealed record ServiceLaneSummaryDto(
    Guid ServiceTypeId,
    string ServiceName,
    int WaitingCount,
    double? EstimatedWaitMinutes,
    string CrowdLevel);

public sealed record CallNextDto(string? TicketNumber, int? CounterNumber, string? Message);

public sealed record MyCounterDto(
    int CounterNumber,
    string BranchName,
    string ServiceLaneName,
    string Mode,
    Guid BranchId,
    IReadOnlyList<Guid> AllowedServiceTypeIds);

public sealed record WaitingTicketDto(string TicketNumber, string EntryType, int Position, double? EstimatedWaitMinutes);

public sealed record ManagerCounterRowDto(
    Guid Id,
    int Number,
    string Mode,
    string? AssignedStaffEmail,
    string AllowedLanesDisplay,
    IReadOnlyList<Guid> AllowedServiceTypeIds,
    Guid? CurrentDedicatedServiceTypeId,
    string? CurrentDedicatedLaneName);

public sealed record BranchOperationalSettingsDto(
    int OnlineQuotaPercent,
    int WalkInQuotaPercent,
    int SlotDurationMinutes,
    int ServiceZoneOffsetMinutes,
    bool AdaptiveSlotCapacityEnabled,
    int? MinSlotTotalCapacity,
    int? MaxSlotTotalCapacity,
    IReadOnlyList<BranchOperatingHourRow> WeeklyOperatingHours);

public sealed record AssignableStaffDto(Guid Id, string Email, string Name, string Role);

public sealed record ManagerInsightAlertDto(string Severity, string Message);

public sealed record ManagerLaneAnalyticsDto(
    Guid ServiceTypeId,
    string ServiceName,
    int WaitingCount,
    int ActiveCountersForLane,
    double? EstimatedWaitMinutes,
    double AvgServiceMinutesObserved,
    int CompletedToday,
    int? NextWindowOnlineCapacity,
    int? NextWindowWalkCapacity,
    string? NextWindowSlotStartIso);

public sealed record ManagerSuggestionDto(
    string Kind,
    string Title,
    string Detail,
    Guid? RelatedServiceTypeId,
    int? RelatedCounterNumber,
    Guid? RelatedCounterId);

public sealed record ManagerInsightsDto(
    IReadOnlyList<ManagerInsightAlertDto> Alerts,
    IReadOnlyList<ManagerSuggestionDto> Suggestions,
    IReadOnlyList<ManagerLaneAnalyticsDto> Lanes,
    int NoShowsToday);
