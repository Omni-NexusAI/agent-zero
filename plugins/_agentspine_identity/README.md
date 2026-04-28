# Agentspine Identity Module

Built-in identity overlay for Agentspine.

This plugin keeps the core application close to upstream A0 while applying the
Agentspine product name, AS version banner, and visible UI copy at runtime. It is
always enabled in Agentspine builds and is not intended for marketplace
distribution.

The default release banner is `AS v0.9.9-standard-pre <timestamp>`. Explicit
`A0_BUILD_VERSION` values still take precedence for local or CI overrides.
