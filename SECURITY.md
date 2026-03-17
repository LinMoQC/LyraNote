# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| `main` branch | ✅ |
| `dev` branch | ✅ |
| Older releases | ❌ |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub Issues.**

If you discover a security vulnerability, please report it responsibly by:

1. **Email**: Send details to the maintainer via GitHub (use the "Report a vulnerability" button in the [Security tab](https://github.com/LinMoQC/LyraNote/security/advisories/new))
2. **GitHub Private Advisory**: Use [GitHub's private vulnerability reporting](https://github.com/LinMoQC/LyraNote/security/advisories/new) feature

### What to Include

Please include as much of the following information as possible:

- Type of issue (e.g., SQL injection, XSS, authentication bypass, data exposure)
- Full paths of source file(s) related to the vulnerability
- Location of the affected source code (tag/branch/commit or direct URL)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact assessment — what an attacker could achieve

### Response Timeline

- **Acknowledgement**: Within 48 hours
- **Initial assessment**: Within 7 days
- **Fix & disclosure**: Coordinated with the reporter; typically within 30 days for critical issues

### Security Considerations for Self-Hosted Deployments

When self-hosting LyraNote, please ensure:

- `api/.env` is never committed to version control (it is in `.gitignore`)
- `JWT_SECRET` is set to a strong random value in production
- MinIO credentials are rotated from the default values
- The API port (8000) is not exposed directly to the internet — use the Nginx reverse proxy
- `DEBUG=false` is set in production

## Scope

The following are **in scope** for security reports:

- Authentication and authorization bypasses
- Data exposure or leakage between users
- Remote code execution
- SQL injection or NoSQL injection
- Sensitive data in logs or error messages
- Insecure default configurations

The following are **out of scope**:

- Vulnerabilities in third-party dependencies (report to the upstream project)
- Social engineering attacks
- Physical security
- Issues requiring physical access to the server
