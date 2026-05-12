using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace QMS.Api.Services;

public sealed class JwtTokenService(IConfiguration configuration)
{
    public string CreateToken(Guid userId, string email, string role)
    {
        var key = configuration["Jwt:Key"] ?? "CHANGE_ME_DEV_ONLY_32_CHARS_MIN!!";
        var issuer = configuration["Jwt:Issuer"] ?? "QMS";
        var audience = configuration["Jwt:Audience"] ?? "QMS";
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
            expires: DateTime.UtcNow.AddHours(8),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
