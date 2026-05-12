namespace QMS.Domain.Enums;

public enum QueueEntryState
{
    Waiting = 0,
    Called = 1,
    Serving = 2,
    Done = 3,
    Absent = 4
}
