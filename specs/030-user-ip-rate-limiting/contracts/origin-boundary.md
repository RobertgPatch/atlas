# Origin and source-trust boundary contract

## Only public entries

The production application has exactly these Internet-facing capabilities:

1. The CloudFront distribution associated with the approved CloudFront-scope WAF ACL.
2. Time-bounded, exact-key presigned S3 operations issued only after authenticated application admission.

The S3 capability is not an alternate API origin. It is a restricted bearer operation with separate constraints below.

## Required private hop chain

```text
Internet viewer
  -> CloudFront + WAF
     -> default static behavior -> private S3 web origin through OAC
     -> /v1/* and /health -> CloudFront VPC origin
        -> internal ALB in private subnets
           -> ECS API task without public IP
              -> private RDS / approved AWS services
```

Ingress is immediate-upstream only:

- ALB: CloudFront VPC-origin boundary only (supported prefix list initially; verified service-managed SG may later tighten it).
- API task: ALB security group only.
- RDS: API security group only.
- Static web bucket: CloudFront OAC/distribution only.
- K-1 bucket: TLS, encryption, exact policy principals/conditions, no public access.

## CloudFront behaviors

- `/v1/*` routes to the VPC origin with only required methods, cookies, query strings, and headers.
- `/health` routes to the VPC origin with a short cache and the general edge emergency envelope.
- `/internal`, `/internal/*`, admin/service-only paths, metadata, and scheduler/worker paths never route to the API origin.
- Default behavior routes only to the private static web S3 origin.
- Distribution-wide 403/404 substitution to `/index.html` is prohibited because it affects API origins.
- SPA fallback must be scoped to eligible static navigation on the default behavior.
- `/v1/*` preserves 401/403/404/429 status, JSON body, `Retry-After`, cache-control, and request correlation headers.

## Viewer source contract

### WAF

- Per-source rate rules use CloudFront viewer `IP` aggregation.
- `FORWARDED_IP` is prohibited for rate aggregation.
- Constant-global rules use `CONSTANT` with exact path/method scope.

### API

- A Terraform-owned origin request policy adds `CloudFront-Viewer-Address` and forwards only required application inputs.
- The API accepts this header only for a connection received through the trusted ALB/private origin path.
- Parse one strict `IP:port` or `[IPv6]:port` value, remove the port, reject control characters, lists, duplicates, malformed text, zone IDs, and non-IP values.
- Normalize IPv4-mapped IPv6 to IPv4 and IPv6 to the approved `/64` prefix.
- Fingerprint before state/telemetry; never retain the raw header or source.
- Framework `request.ip`/XFF behavior is separately tested right-to-left with narrowed trusted proxy ranges. No leftmost viewer-supplied value becomes a rate key.
- Missing/malformed generated source on an external API request fails closed. Local/test adapters use explicit test source context and cannot be enabled in production.

## Terraform and plan-policy failures

Production validation fails if the plan contains any of these:

- Internet-facing API ALB or public ALB subnets.
- ECS/Fargate public IP or public service-connect/API endpoint.
- Public RDS or broad database ingress.
- `0.0.0.0/0`, `::/0`, arbitrary CIDR, or unrelated SG ingress to ALB/API/RDS.
- API Gateway, Lambda Function URL, public EC2 API, or alternate public backend.
- Route 53 alias/CNAME to the ALB or any API origin other than CloudFront.
- Output exposing an origin hostname/address as an application endpoint.
- CloudFront custom/public API origin instead of exactly one VPC API origin.
- Missing or wrong WAF association.
- `/internal*` API behavior.
- Request-count or CPU autoscaling that can exceed the approved fixed one-task fleet.
- Managed origin request policy that does not provide the generated viewer address contract.
- Distribution-wide SPA custom error rewriting.

## Service-managed security-group transition

The current internal ALB plus CloudFront origin-facing prefix list is acceptable. A move to `CloudFront-VPCOrigins-Service-SG` is two-phase:

1. Add and verify the service-managed SG relationship while retaining the prefix-list rule.
2. In a later reviewed apply, remove the prefix-list rule after live origin verification.

Never combine first discovery/creation and removal of the working rule in one apply. Failure rolls back by retaining/restoring the prefix-list rule; the ALB never becomes public.

## Presigned S3 capability contract

- Slot issuance requires authenticated source/user/global and exact workload/quota admission.
- No rejected request returns a URL, credential, bucket/key, or operation capable of upload.
- The server chooses one quarantine bucket/key and bounded content length/type.
- URL lifetime and bucket `s3:signatureAge` are short and versioned; target five minutes unless an evidence-backed workflow needs less/more.
- `If-None-Match: *` is signed and required by quarantine-prefix bucket policy.
- A second PUT to the same key returns precondition failure and creates no new object version.
- Bucket version/object/request growth is alarmed; the K-1 kill switch disables new issuance.
- Presigned URLs are redacted as Restricted credentials in every log/error.

## Verification

- Terraform native tests assert the positive topology and mutate fixtures to exercise every failure above.
- Production plan policy checks rendered resources, not just source text.
- API tests cover spoofed XFF/generated header, duplicates, malformed values, IPv4 mapping, IPv6 `/64`, and missing source.
- CloudFront/API contract tests verify 401/403/404/429 are not converted to SPA 200 responses.
- S3 adapter tests prove signed conditional headers, signature age, replay rejection, and one-version maximum without contacting production.
- Optional operator connectivity evidence tests origin hostnames from outside the VPC only through non-destructive probes.

