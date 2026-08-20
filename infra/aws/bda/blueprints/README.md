# Blueprint sources

Blueprint JSON files in this directory describe alternative K-1 form revision
families, not separate fragments of one document. The BDA project selects one
matching blueprint per PDF and also includes a fallback blueprint so unknown
forms and revisions are routed to review.

Only sanitized field labels and descriptions belong here. Every version must
retain repeated coded rows as lists and remain compatible with the mapping
version declared in `../mapping-schema.json`.
