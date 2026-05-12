namespace QMS.Application.Geo;

public static class GeoDistance
{
    /// <summary>Great-circle distance in meters (WGS84 sphere approximation).</summary>
    public static double Meters(double lat1, double lon1, double lat2, double lon2)
    {
        const double earthRadiusM = 6371000d;
        var φ1 = lat1 * (Math.PI / 180d);
        var φ2 = lat2 * (Math.PI / 180d);
        var Δφ = (lat2 - lat1) * (Math.PI / 180d);
        var Δλ = (lon2 - lon1) * (Math.PI / 180d);

        var a = Math.Sin(Δφ / 2) * Math.Sin(Δφ / 2) +
                Math.Cos(φ1) * Math.Cos(φ2) * Math.Sin(Δλ / 2) * Math.Sin(Δλ / 2);
        var c = 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
        return earthRadiusM * c;
    }
}
