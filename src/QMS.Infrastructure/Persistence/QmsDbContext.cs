using Microsoft.EntityFrameworkCore;
using QMS.Domain.Entities;
using QMS.Domain.Enums;

namespace QMS.Infrastructure.Persistence;

public sealed class QmsDbContext : DbContext
{
    public QmsDbContext(DbContextOptions<QmsDbContext> options) : base(options) { }

    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<Branch> Branches => Set<Branch>();
    public DbSet<ServiceType> ServiceTypes => Set<ServiceType>();
    public DbSet<Counter> Counters => Set<Counter>();
    public DbSet<CounterAllowedService> CounterAllowedServices => Set<CounterAllowedService>();
    public DbSet<Staff> StaffMembers => Set<Staff>();
    public DbSet<TimeSlot> TimeSlots => Set<TimeSlot>();
    public DbSet<Booking> Bookings => Set<Booking>();
    public DbSet<QueueEntry> QueueEntries => Set<QueueEntry>();
    public DbSet<ServiceSessionLog> ServiceSessionLogs => Set<ServiceSessionLog>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<AnalyticsSummary> AnalyticsSummaries => Set<AnalyticsSummary>();
    public DbSet<MlTrainingObservation> MlTrainingObservations => Set<MlTrainingObservation>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Customer>(e =>
        {
            e.ToTable("CUSTOMERS");
            e.HasIndex(x => x.Email).IsUnique();
            e.Property(x => x.Email).HasMaxLength(256);
            e.Property(x => x.Name).HasMaxLength(200);
            e.Property(x => x.CreatedAt).HasDefaultValueSql("SYSUTCDATETIMEOFFSET()");
            e.HasOne(x => x.PreferredBranch).WithMany().HasForeignKey(x => x.PreferredBranchId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<Branch>(e =>
        {
            e.ToTable("BRANCHES");
            e.HasIndex(x => x.BranchCode).IsUnique();
            e.Property(x => x.Name).HasMaxLength(200);
            e.Property(x => x.Address).HasMaxLength(400);
            e.Property(x => x.State).HasMaxLength(80);
            e.Property(x => x.OperatingHours).HasMaxLength(200);
        });

        modelBuilder.Entity<ServiceType>(e =>
        {
            e.ToTable("SERVICES");
            e.HasIndex(x => new { x.BranchId, x.Code }).IsUnique();
            e.Property(x => x.Code).HasMaxLength(32);
            e.Property(x => x.Name).HasMaxLength(200);
            e.HasOne(x => x.Branch).WithMany(b => b.Services).HasForeignKey(x => x.BranchId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Counter>(e =>
        {
            e.ToTable("COUNTERS");
            e.HasIndex(x => new { x.BranchId, x.Number }).IsUnique();
            e.HasOne(x => x.Branch).WithMany(b => b.Counters).HasForeignKey(x => x.BranchId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.AssignedStaff).WithMany().HasForeignKey(x => x.StaffId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.CurrentServiceType).WithMany().HasForeignKey(x => x.CurrentServiceTypeId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<CounterAllowedService>(e =>
        {
            e.ToTable("COUNTER_ALLOWED_SERVICES");
            e.HasKey(x => new { x.CounterId, x.ServiceTypeId });
            e.HasOne(x => x.Counter)
                .WithMany(c => c.AllowedServices)
                .HasForeignKey(x => x.CounterId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.ServiceType)
                .WithMany(s => s.CounterCapabilities)
                .HasForeignKey(x => x.ServiceTypeId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Staff>(e =>
        {
            e.ToTable("STAFF");
            e.HasIndex(x => x.Email).IsUnique();
            e.Property(x => x.Email).HasMaxLength(256);
            e.Property(x => x.Name).HasMaxLength(200);
            e.HasOne(x => x.Branch).WithMany(b => b.StaffMembers).HasForeignKey(x => x.BranchId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<TimeSlot>(e =>
        {
            e.ToTable("TIME_SLOTS");
            e.HasIndex(x => new { x.BranchId, x.ServiceTypeId, x.StartTime, x.EndTime });
            e.HasOne(x => x.Branch).WithMany(b => b.TimeSlots).HasForeignKey(x => x.BranchId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.ServiceType).WithMany(s => s.TimeSlots).HasForeignKey(x => x.ServiceTypeId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Booking>(e =>
        {
            e.ToTable("BOOKINGS");
            e.HasOne(x => x.Customer).WithMany(u => u.Bookings).HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Branch).WithMany().HasForeignKey(x => x.BranchId).OnDelete(DeleteBehavior.NoAction);
            e.HasOne(x => x.ServiceType).WithMany(s => s.Bookings).HasForeignKey(x => x.ServiceTypeId).OnDelete(DeleteBehavior.NoAction);
            e.HasOne(x => x.TimeSlot).WithMany(t => t.Bookings).HasForeignKey(x => x.TimeSlotId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.QueueEntry).WithOne(q => q.Booking).HasForeignKey<QueueEntry>(q => q.BookingId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<QueueEntry>(e =>
        {
            e.ToTable("QUEUE_TICKETS");
            e.HasIndex(x => x.BookingId).IsUnique().HasFilter("[BookingId] IS NOT NULL");
            e.HasIndex(x => new { x.BranchId, x.TicketNumber }).IsUnique();
            e.Property(x => x.TicketNumber).HasMaxLength(32);
            e.HasOne(x => x.Branch).WithMany().HasForeignKey(x => x.BranchId).OnDelete(DeleteBehavior.NoAction);
            e.HasOne(x => x.ServiceType).WithMany(s => s.QueueEntries).HasForeignKey(x => x.ServiceTypeId).OnDelete(DeleteBehavior.NoAction);
            e.HasOne(x => x.Counter).WithMany().HasForeignKey(x => x.CounterId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<ServiceSessionLog>(e =>
        {
            e.ToTable("SERVICE_LOGS");
            e.HasOne(x => x.ServiceType).WithMany(s => s.ServiceLogs).HasForeignKey(x => x.ServiceTypeId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Notification>(e =>
        {
            e.ToTable("NOTIFICATIONS");
            e.Property(x => x.Message).HasMaxLength(2000);
            e.HasOne(x => x.Customer).WithMany(u => u.Notifications).HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Booking).WithMany(b => b.Notifications).HasForeignKey(x => x.BookingId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<AnalyticsSummary>(e =>
        {
            e.ToTable("ANALYTICS_SUMMARY");
            e.HasIndex(x => new { x.BranchId, x.ReportDate }).IsUnique();
            e.Property(x => x.PeakHourLabel).HasMaxLength(64);
            e.HasOne(x => x.Branch).WithMany(b => b.AnalyticsSummaries).HasForeignKey(x => x.BranchId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<MlTrainingObservation>(e =>
        {
            e.ToTable("ML_TRAINING_DATA");
            e.HasOne(x => x.Branch).WithMany(b => b.MlTrainingObservations).HasForeignKey(x => x.BranchId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.ServiceType).WithMany(s => s.MlTrainingObservations).HasForeignKey(x => x.ServiceTypeId).OnDelete(DeleteBehavior.SetNull);
        });
    }
}
