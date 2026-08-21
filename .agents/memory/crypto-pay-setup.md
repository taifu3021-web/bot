---
name: Crypto payment setup
description: Durable constraints for the crypto payment dashboard and generated API contracts.
---

OpenAPI integer fields currently generate `zod.int()` while this workspace resolves Zod 3, which breaks library typechecking. Use numeric fields with explicit min/max validation until the generator/runtime versions are aligned.

**Why:** Code generation completed, but the chained library typecheck failed on every integer schema.

**How to apply:** If integer semantics are needed, validate whole-number values in route code or upgrade the generator/runtime together before restoring OpenAPI integer types.