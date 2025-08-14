# Available Secret Placeholders
For safety, user secrets are masked and used as placeholders.
Use these placeholders in tool calls, they will be automatically replaced with actual values.

You have access to the following secrets:
{{secrets}}


## Important Guidelines:
- Use the exact placeholder format: §§KEY_NAME§§ (double section sign markers)
- Secret values may contain special characters that need escaping in JSON strings, keep in mind and sanitize in your code
- Placeholders are case-sensitive and must match the exact key names

