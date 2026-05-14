using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using QMS.Application.Capacity;
using QMS.Domain.Entities;
using QMS.Domain.Enums;
using QMS.Infrastructure.Persistence;

namespace QMS.Api.Services;

public static class QmsDataSeeder
{
    public static async Task SeedAsync(IServiceProvider services)
    {
        var db = services.GetRequiredService<QmsDbContext>();
        var hasher = services.GetRequiredService<IPasswordHasher<string>>();
        var capacityEngine = services.GetRequiredService<ICapacityEngine>();

        if (await db.Branches.AnyAsync()) return;

        var definitions = new (int Code, string Name, double Lat, double Lng, string Address, string State)[]
        {
            (
                101001,
                "KLCC Branch",
                3.15792,
                101.71169,
                "PETRONAS Twin Towers, Kuala Lumpur City Centre, 50088 Kuala Lumpur",
                "Kuala Lumpur"
            ),
            (
                101002,
                "Mid Valley Branch",
                3.11897,
                101.67476,
                "Mid Valley Megamall, Lingkaran Syed Putra, 59200 Kuala Lumpur",
                "Kuala Lumpur"
            ),
            (
                101003,
                "Pavilion KL",
                3.14887,
                101.71338,
                "168, Jalan Bukit Bintang, Bukit Bintang, 55100 Kuala Lumpur",
                "Kuala Lumpur"
            ),
            (
                101004,
                "George Town Branch",
                5.41638,
                100.33267,
                "Beach Street, George Town, 10300 Pulau Pinang",
                "Pulau Pinang"
            ),
        };

        var branches = new List<Branch>();
        var serviceTypes = new List<ServiceType>();
        var counters = new List<Counter>();

        var heroImages = new[]
        {
            "https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=600&q=80",
            "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=600&q=80",
            "https://images.unsplash.com/photo-1497366216548-37526070297c?w=600&q=80",
            "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&q=80",
        };
        var imgIdx = 0;
        foreach (var (code, name, lat, lng, addr, state) in definitions)
        {
            var branch = new Branch
            {
                Id = Guid.NewGuid(),
                BranchCode = code,
                Name = name,
                Address = addr,
                State = state,
                Latitude = lat,
                Longitude = lng,
                OnlineQuotaPercent = 70,
                SlotDurationMinutes = 30,
                GeofenceMeters = 80,
                ServiceZoneOffsetMinutes = 8 * 60,
                OperatingHours = "Mon–Fri 9:00–17:00; Sat 9:30–13:00",
                ImageUrl = heroImages[Math.Min(imgIdx, heroImages.Length - 1)],
            };
            imgIdx++;
            branches.Add(branch);

            var svcs = new[]
            {
                new ServiceType { Id = Guid.NewGuid(), BranchId = branch.Id, Code = "ACC", Name = "General Banking", DefaultAvgServiceMinutes = 12 },
                new ServiceType { Id = Guid.NewGuid(), BranchId = branch.Id, Code = "LOAN", Name = "Loan consultation", DefaultAvgServiceMinutes = 20 },
                new ServiceType { Id = Guid.NewGuid(), BranchId = branch.Id, Code = "CASH", Name = "Deposit/Withdrawal", DefaultAvgServiceMinutes = 8 },
            };
            serviceTypes.AddRange(svcs);

            var c0 = new Counter { Id = Guid.NewGuid(), BranchId = branch.Id, Number = 1, Mode = CounterMode.Active };
            var c1 = new Counter { Id = Guid.NewGuid(), BranchId = branch.Id, Number = 2, Mode = CounterMode.Active };
            var c2 = new Counter { Id = Guid.NewGuid(), BranchId = branch.Id, Number = 3, Mode = CounterMode.Active };
            counters.AddRange(new[] { c0, c1, c2 });

            c1.AllowedServices.Add(new CounterAllowedService { ServiceTypeId = svcs[1].Id });
        }

        var primary = branches[0];
        var primaryCounters = counters.Where(c => c.BranchId == primary.Id).OrderBy(c => c.Number).ToArray();
        var primarySvcs = serviceTypes.Where(s => s.BranchId == primary.Id).OrderBy(s => s.Code).ToArray();
        var cash = primarySvcs.First(s => s.Code == "CASH");
        var gen = primarySvcs.First(s => s.Code == "ACC");
        var loan = primarySvcs.First(s => s.Code == "LOAN");

        var customer = new Customer
        {
            Id = Guid.NewGuid(),
            Email = "customer@qms.demo",
            Name = "Demo Customer",
            PasswordHash = hasher.HashPassword("customer@qms.demo", "Demo123!"),
        };
        customer.FavoriteBranches.Add(new CustomerFavoriteBranch { BranchId = primary.Id });

        var extraCustomers = Enumerable.Range(1, 15).Select(i =>
        {
            var email = $"cust{i:00}@qms.demo";
            var c = new Customer
            {
                Id = Guid.NewGuid(),
                Email = email,
                Name = $"Demo Customer {i:00}",
                PasswordHash = hasher.HashPassword(email, "Demo123!"),
            };
            c.FavoriteBranches.Add(new CustomerFavoriteBranch { BranchId = primary.Id });
            return c;
        }).ToList();

        var tellerStaff = new Staff
        {
            Id = Guid.NewGuid(),
            Email = "staff@qms.demo",
            Name = "Demo Teller",
            BranchId = primary.Id,
            Role = StaffRoleKind.Staff,
            PasswordHash = hasher.HashPassword("staff@qms.demo", "Demo123!"),
            Status = StaffPresenceStatus.Active
        };

        var managerStaff = new Staff
        {
            Id = Guid.NewGuid(),
            Email = "manager@qms.demo",
            Name = "Demo Manager",
            BranchId = primary.Id,
            Role = StaffRoleKind.Manager,
            PasswordHash = hasher.HashPassword("manager@qms.demo", "Demo123!"),
            Status = StaffPresenceStatus.Active
        };

        primaryCounters[0].StaffId = tellerStaff.Id;
        primaryCounters[1].StaffId = managerStaff.Id;

        db.Branches.AddRange(branches);
        db.ServiceTypes.AddRange(serviceTypes);
        db.Counters.AddRange(counters);
        db.Customers.AddRange(new[] { customer }.Concat(extraCustomers));
        db.StaffMembers.AddRange(tellerStaff, managerStaff);
        await db.SaveChangesAsync();

        static bool CounterCanServeLane(Counter c, Guid laneServiceTypeId) =>
            c.AllowedServices.Count == 0 || c.AllowedServices.Any(a => a.ServiceTypeId == laneServiceTypeId);

        var timeSlotRows = new List<TimeSlot>();
        foreach (var br in branches)
        {
            var brCounters = counters.Where(c => c.BranchId == br.Id).ToList();
            var slotMinutes = br.SlotDurationMinutes < 1 ? 30 : br.SlotDurationMinutes;
            var startMin = br.ServiceDayStartMinutes;
            var endMin = br.ServiceDayEndMinutes;
            if (endMin <= startMin)
            {
                startMin = 9 * 60;
                endMin = 17 * 60;
            }

            foreach (var svc in serviceTypes.Where(s => s.BranchId == br.Id))
            {
                var laneCounters = Math.Max(
                    1,
                    brCounters.Count(c => c.Mode == CounterMode.Active && CounterCanServeLane(c, svc.Id)));
                var plan = capacityEngine.Compute(slotMinutes, svc.DefaultAvgServiceMinutes, laneCounters, br.OnlineQuotaPercent);

                var brZone = TimeSpan.FromMinutes(br.ServiceZoneOffsetMinutes);
                var z = DateTimeOffset.UtcNow.ToOffset(brZone);
                var brDayStart = new DateTimeOffset(z.Year, z.Month, z.Day, 0, 0, 0, brZone);
                var windowStart = brDayStart.AddMinutes(startMin);
                var windowEnd = brDayStart.AddMinutes(endMin);
                for (var t = windowStart; t < windowEnd; t = t.AddMinutes(slotMinutes))
                {
                    var slotEnd = t.AddMinutes(slotMinutes);
                    timeSlotRows.Add(new TimeSlot
                    {
                        Id = Guid.NewGuid(),
                        BranchId = br.Id,
                        ServiceTypeId = svc.Id,
                        StartTime = t,
                        EndTime = slotEnd,
                        TotalCapacity = plan.TotalCapacity,
                        OnlineQuota = plan.OnlineCapacity,
                        WalkInQuota = plan.WalkInBufferCapacity,
                        BookedOnline = 0,
                        BookedWalkin = 0,
                        Status = TimeSlotWindowStatus.Open
                    });
                }
            }
        }

        db.TimeSlots.AddRange(timeSlotRows);

        await db.SaveChangesAsync();

        var zone = TimeSpan.FromMinutes(primary.ServiceZoneOffsetMinutes);
        var todayZ = DateTimeOffset.UtcNow.ToOffset(zone);
        var dayStart = new DateTimeOffset(todayZ.Year, todayZ.Month, todayZ.Day, 0, 0, 0, zone);
        var slot0 = dayStart.AddMinutes(primary.ServiceDayStartMinutes);
        var slot1 = slot0.AddMinutes(primary.SlotDurationMinutes);
        var slot2 = slot1.AddMinutes(primary.SlotDurationMinutes);
        var pm1300 = dayStart.AddMinutes(13 * 60);
        var pm1330 = pm1300.AddMinutes(primary.SlotDurationMinutes);
        var pm1400 = pm1330.AddMinutes(primary.SlotDurationMinutes);

        async Task AddWaitingBookingAsync(Customer user, ServiceType svc, DateTimeOffset start, DateTimeOffset end, int suffix)
        {
            var ts = await db.TimeSlots.AsNoTracking().FirstOrDefaultAsync(
                t => t.BranchId == primary.Id && t.ServiceTypeId == svc.Id && t.StartTime == start && t.EndTime == end);
            var seq = start.ToUnixTimeSeconds() * 10_000L + suffix;
            var booking = new Booking
            {
                Id = Guid.NewGuid(),
                CustomerId = user.Id,
                BranchId = primary.Id,
                ServiceTypeId = svc.Id,
                TimeSlotId = ts?.Id,
                SlotStart = start,
                SlotEnd = end,
                Status = BookingStatus.Confirmed
            };
            var entry = new QueueEntry
            {
                Id = Guid.NewGuid(),
                BranchId = primary.Id,
                ServiceTypeId = svc.Id,
                TicketNumber = $"{primary.BranchCode}-{seq}",
                EntryType = QueueEntryType.OnlineBooked,
                State = QueueEntryState.Waiting,
                BookingId = booking.Id,
                EnqueueSequence = seq
            };
            booking.QueueEntry = entry;
            db.Bookings.Add(booking);
        }

        await AddWaitingBookingAsync(extraCustomers[0], cash, pm1300, pm1330, 0);
        await AddWaitingBookingAsync(extraCustomers[1], cash, pm1330, pm1400, 0);
        await AddWaitingBookingAsync(extraCustomers[2], cash, slot1, slot2, 0);
        await AddWaitingBookingAsync(extraCustomers[3], gen, slot2, slot2.AddMinutes(primary.SlotDurationMinutes), 0);
        await AddWaitingBookingAsync(extraCustomers[4], loan, pm1400, pm1400.AddMinutes(primary.SlotDurationMinutes), 0);
        await AddWaitingBookingAsync(extraCustomers[5], cash, pm1300, pm1330, 1);

        static DateTimeOffset AlignSlotForSeed(DateTimeOffset now, int slotMinutes)
        {
            var minutes = now.Hour * 60 + now.Minute;
            var aligned = minutes / slotMinutes * slotMinutes;
            return new DateTimeOffset(now.Year, now.Month, now.Day, 0, 0, 0, now.Offset).AddMinutes(aligned);
        }

        var walkBucketStart = AlignSlotForSeed(todayZ, primary.SlotDurationMinutes);
        var walkBucketEnd = walkBucketStart.AddMinutes(primary.SlotDurationMinutes);
        var walkSeq = walkBucketStart.ToUnixTimeSeconds() * 10_000L + 100;
        db.QueueEntries.Add(new QueueEntry
        {
            Id = Guid.NewGuid(),
            BranchId = primary.Id,
            ServiceTypeId = cash.Id,
            TicketNumber = $"{primary.BranchCode}-{walkSeq}",
            EntryType = QueueEntryType.WalkIn,
            State = QueueEntryState.Waiting,
            EnqueueSequence = walkSeq,
            WalkInCapacityBucketStart = walkBucketStart,
            WalkInCapacityBucketEnd = walkBucketEnd
        });

        await db.SaveChangesAsync();
    }
}
