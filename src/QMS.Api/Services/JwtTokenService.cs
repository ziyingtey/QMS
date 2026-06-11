using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace QMS.Api.Services;

public sealed class JwtTokenService(IConfiguration configuration)
{
    /// <summary>Short-lived bearer JWT (use refresh token for long sessions).</summary>
    public string CreateAccessToken(Guid userId, string email, string role)
    {
        var key = configuration["Jwt:Key"] ?? "CHANGE_ME_DEV_ONLY_32_CHARS_MIN!!";
        var issuer = configuration["Jwt:Issuer"] ?? "QMS";
        var audience = configuration["Jwt:Audience"] ?? "QMS";
        var accessMinutes = configuration.GetValue("Jwt:AccessTokenMinutes", 15);
        if (accessMinutes < 1) accessMinutes = 1;
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, userId.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, email),
            new Claim(ClaimTypes.Role, role)
        };

        var creds = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)),
            SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer,
            audience,
            claims,
            expires: DateTime.UtcNow.AddMinutes(accessMinutes),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
