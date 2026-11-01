# 17 CloudFormation parser

Detect CloudFormation YAML/JSON by content (`AWSTemplateFormatVersion` or `Resources` with `AWS::` types). Map resource types to design parts deterministically; unmapped types listed as not priced. Opens the workspace with usage questions expanded. No LLM.

**Acceptance**: fixture templates (synthetic) map to expected parts.
