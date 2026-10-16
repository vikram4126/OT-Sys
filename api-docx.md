ARC REST API Documentation
Version 1.0 | Sample Developer Reference

Contents
1. Overview
The ARC REST API enables authorized applications to create, retrieve, update, and delete asset records. It uses JSON request and response bodies, standard HTTP methods, and resource-oriented endpoints. This sample is intended as a reusable documentation template; replace placeholder values with implementation-specific details before publication.
1.1 Key Capabilities
•	Register and retrieve assets.
•	Update asset metadata and lifecycle status.
•	Filter and paginate asset collections.
•	Delete assets when permitted.
•	Return consistent success and error responses.
2. API Environments
Environment	Base URL	Purpose
Development	https://arc.customappsteam.co.uk/api
Developer integration and testing
UAT		User acceptance testing
Production		Live workloads

3. Authentication and Authorization
State-changing API requests use cookie-based CSRF protection. Send the same CSRF token value in both required headers for POST, PATCH, and DELETE requests. GET requests do not require these CSRF headers.
Required headers
Cookie: csrftoken={csrf-token}
x-csrftoken: {csrf-token}
4. Common Conventions
•	Format: Request and response bodies use JSON encoded as UTF-8.
•	CSRF protection: For POST, PATCH, and DELETE requests, clients must send the same server-issued token in Cookie: csrftoken={csrf-token} and x-csrftoken: {csrf-token}. GET requests do not require these headers.
5. Feature-wise API Reference
Feature	Base Path	Status	Purpose
Health	/health	Available	Checks service health and returns the CSRF token.
Models	/model	Available	Manages model records and related metadata.
Zones	/api/zones, /api/zone-rules, /api/conduits	Available	Manages tenant-scoped zones, subnet rules, overrides, deletion impact, air-gap checks, and conduits.
Evidence	/api/model/evidence	Available	Manages the evidence checklist, findings, blind spots, group summaries, and evidence-drop scans.
Compliance	/api/compliance	Available	Manages IEC 62443 functional requirements, system requirements, assessment statuses, summaries, diagrams, and applicable requirements.
Assets	/api/assets	Available	Manages asset inventory records and internet-facing asset suggestions.

6. Models
6.1 Model Feature API Reference
Base router prefix: /api/model, mounted from backend/app/features/model/router.py.
Method	Endpoint	Description
POST	/parse-connections/	Parses Azure stored evidence files
GET	/parse-connections/jobs/{job_id}	Polls the status of the parsing job
POST	/api/model/reconcile/	Runs the seed reconciliation job
GET	/api/model/reconcile/jobs/{job_id}	Polls the status of the reconciliation job
POST	/uploaded-seeds/load	Parses Azure based seed json files
Authentication, CSRF, and tenant scope
State-changing Models endpoints require the following headers:
Cookie: csrftoken={csrf-token}
x-csrftoken: {csrf-token}

GET endpoints do not require these CSRF headers. The tenant identifier, client_id, is currently resolved by the development placeholder _get_client_id(), which returns "dev-client-001" until production authentication is integrated. Every request remains scoped to the resolved client.
6.2 Parse Connection Files
POST /api/model/parse-connections/
Parses network-discovery export files stored in Azure Blob Storage for the authenticated client and imports the assets and connections they describe. Supported inputs include .json, .pcap, .raw, switch or firewall configurations, and .junos files. The API creates the job synchronously and processes it in the background. Poll GET /api/model/parse-connections/jobs/{job_id} for progress and results.

Mandatory parameters
Required headers:
Cookie: csrftoken={csrf-token}
x-csrftoken: {csrf-token}
Required path parameters: None
Required query parameters: None
Required body fields:
• files (array of 1–50 non-blank blob file-name strings, required)

Files are read from the ASSETS_CONTAINER blob container under the client prefix {client_id}/{file_name}. Blob names outside that prefix are resolved relative to it, and parent-directory path segments are rejected.
Required fields and validation — ParseConnectionsRequest
•	files: Required array containing 1–50 non-blank blob file-name strings.
•	A 400 Bad Request response is returned when the list is empty, contains more than 50 items, or includes a blank file name.
Example request body
{
  "files": ["pcap_assets.json", "switch-configs/core-sw1.cfg"]
}
Example 202 Accepted response
{
  "id": "8d50718a-93f8-4b15-88bd-50a9df05cd2e",
  "status": "pending",
  "total_files": 2,
  "processed_files": 0,
  "connections_added": 0,
  "shadow_assets_added": 0,
  "error": "",
  "created_at": "2026-09-21T08:30:00Z",
  "updated_at": "2026-09-21T08:30:00Z"
}
Error response
400 Bad Request — The files list is invalid or empty.
6.3 Get Parse Connection Job
GET /api/model/parse-connections/jobs/{job_id}
Polls the status of a previously created parse job for the authenticated client. The status transitions from pending to running, then to completed or failed. processed_files, connections_added, and shadow_assets_added are updated incrementally after each file finishes. If parsing fails, error contains the failing file name.

Mandatory parameters
Required headers: None
Required path parameters: job_id (string)
Required query parameters: None
Required body: None
Example 200 OK response
{
  "id": "8d50718a-93f8-4b15-88bd-50a9df05cd2e",
  "status": "completed",
  "total_files": 2,
  "processed_files": 2,
  "connections_added": 14,
  "shadow_assets_added": 6,
  "error": "",
  "created_at": "2026-09-21T08:30:00Z",
  "updated_at": "2026-09-21T08:30:05Z"
}
Error response
404 Not Found — No job with the supplied id exists for the authenticated client.
{"detail": "Parse job not found"}
6.4 Start Reconciliation
POST /api/model/reconcile/
Starts a shadow-asset reconciliation run for the authenticated client. The endpoint reads the client’s existing tenant-scoped seed tables directly from the database and runs the reconciliation engine as a background task. Poll GET /api/model/reconcile/jobs/{job_id} for progress and results.

Mandatory parameters
Required headers:
Cookie: csrftoken={csrf-token}
x-csrftoken: {csrf-token}
Required path parameters: None
Required query parameters: None
Required body: None
Input tables
•	asset_register_seed
•	flow_logs_seed
•	network_exclusions_seed
•	pcap_capture_meta
•	pcap_devices_seed
•	pcap_zones_seed
Example 202 Accepted response
{
  "id": "3f1c9e2a-6b7d-4a10-9c1e-2b6a7d4f9c11",
  "client_id": "dev-client-001",
  "capture_id": null,
  "status": "pending",
  "file_names": ["asset_register_seed.jsonl", "flow_logs_seed.jsonl"],
  "input_tables": ["asset_register_seed", "flow_logs_seed", "network_exclusions_seed", "pcap_capture_meta", "pcap_devices_seed", "pcap_zones_seed"],
  "verdict_count": 0,
  "finding_count": 0,
  "queue_item_count": 0,
  "register_only_count": 0,
  "reduction_problem_count": 0,
  "error_message": null,
  "created_at": "2026-09-21T08:30:00Z",
  "started_at": null,
  "completed_at": null
}
6.5 Get Reconciliation Job
GET /api/model/reconcile/jobs/{job_id}
Polls the reconciliation job for the authenticated client. The status transitions from pending to running, then to completed or failed. On completion, verdict_count, finding_count, queue_item_count, register_only_count, and reduction_problem_count summarize persisted results. On failure, error_message is populated and truncated to 500 characters.

Mandatory parameters
Required headers: None
Required path parameters: job_id (string)
Required query parameters: None
Required body: None
Example 200 OK response
{
  "id": "3f1c9e2a-6b7d-4a10-9c1e-2b6a7d4f9c11",
  "client_id": "dev-client-001",
  "capture_id": "capture-2026-09-01",
  "status": "completed",
  "file_names": ["asset_register_seed.jsonl", "flow_logs_seed.jsonl"],
  "input_tables": ["asset_register_seed", "flow_logs_seed", "network_exclusions_seed", "pcap_capture_meta", "pcap_devices_seed", "pcap_zones_seed"],
  "verdict_count": 42,
  "finding_count": 5,
  "queue_item_count": 3,
  "register_only_count": 7,
  "reduction_problem_count": 0,
  "error_message": null,
  "created_at": "2026-09-21T08:30:00Z",
  "started_at": "2026-09-21T08:30:01Z",
  "completed_at": "2026-09-21T08:30:04Z"
}
Error response
404 Not Found — No job with the supplied id exists for the authenticated client.
{"detail": "Reconcile job not found"}
6.6 Load Uploaded Seed Files
POST /api/model/uploaded-seeds/load
Parses Azure Blob Storage seed JSON or JSONL files for the authenticated client and loads them into the respective seed tables. This operation is synchronous and does not create a background job. For each loaded table and source combination, existing rows are replaced before new rows are inserted.

Mandatory parameters
Required headers:
Cookie: csrftoken={csrf-token}
x-csrftoken: {csrf-token}
Required path parameters: None
Required query parameters: None
Required body fields:
• files (array of up to 20 non-blank supported seed file names, optional)
If the request body is omitted or files is null, all known seed files are loaded.
Files are read from UPLOADED_SEEDS_CONTAINER. The service first checks {client_id}/{file_name}, then falls back to the bare file name.
Request and validation — LoadUploadedSeedsRequest
•	files: Optional array of up to 20 non-blank strings identifying supported seed files.
•	Each name is matched case-insensitively by exact name or stem substring to a known seed table.
•	If the request body is omitted or files is null, all known seed files are loaded.
Known seed files
asset_register_seed.jsonl
flow_logs_seed.jsonl
network_exclusions_seed.jsonl
pcap_capture_meta.json
pcap_devices_seed.jsonl
pcap_zones_seed.jsonl
Example request body — selected files
{
  "files": ["asset_register_seed.jsonl", "pcap_devices_seed.jsonl"]
}
Example request body — all known seed files
{}
Example 200 OK response
{
  "container": "uploaded-seeds",
  "loaded": {
    "asset_register_seed": 120,
    "pcap_devices_seed": 48
  },
  "total_rows": 168
}
Error response
400 Bad Request — Returned for an unsupported seed file name, malformed JSON or JSONL, missing required row fields, row or size limit violations, a missing blob, or an unconfigured Azure Blob Storage account or uploaded-seeds container. Underlying causes may include FileNotFoundError, RuntimeError, ValueError, or schema ValidationError.

7. Zones
7.1 Zones and Subnet Segmentation API Reference
Base router prefixes: /api/zones, /api/zone-rules, and /api/conduits.
The Zones feature manages tenant-scoped security zones, subnet rules, and the conduits that connect zones.
Method	Endpoint	Description
GET	/api/zones/	Lists zones
GET	/api/zones/{zone_id}	Gets a zone
POST	/api/zones/	Creates a zone
PATCH	/api/zones/{zone_id}	Updates a zone
PATCH	/api/zones/batch	Atomically updates multiple zones
POST / DELETE	/api/zones/{zone_id}/override/	Applies or clears an override
GET	/api/zones/{zone_id}/delete-preview	Previews zone deletion impact
DELETE	/api/zones/{zone_id}	Deletes a zone
GET	/api/zones/{zone_id}/air-gap-check	Checks air-gap consistency
GET / POST	/api/zones/{zone_id}/rules	Lists or creates subnet rules
DELETE	/api/zone-rules/{rule_id}	Deletes a subnet rule
GET / POST	/api/conduits/	Lists or creates conduits
DELETE	/api/conduits/{conduit_id}	Deletes a conduit

Authentication, CSRF, permissions, and tenant scope
The server derives client_id from the authenticated user; callers do not send it. GET endpoints require authentication. Create, update, and override operations require edit permission. Zone, rule, and conduit deletion requires admin permission.

Required headers for the endpoints in this section:
Cookie: csrftoken={csrf-token}
x-csrftoken: {csrf-token}

No endpoint accepts query parameters. Missing or invalid identity returns 401; insufficient permission returns 403; validation failures return 422; and unknown resources generally return 404.
7.2 List Zones
GET /api/zones/
Returns all zones for the authenticated client.

Mandatory parameters
Required headers:
Cookie: csrftoken={csrf-token}
x-csrftoken: {csrf-token}
Required path parameters: None
Required query parameters: None
Required body: None

Example 200 OK response
[{"id":"Z-A1B2C3D4","client_id":"client-123","name":"Level 2 Control","desc":"PLC and controller network","purdue_level":2,"target_sl":3,"criticality":4.0,"exposure":2.0,"air_gapped":false,"created_at":"2026-09-22T10:00:00Z"}]
7.3 Get a Zone
GET /api/zones/{zone_id}
Returns one zone for the authenticated client.

Mandatory parameters
Required headers:
Cookie: csrftoken={csrf-token}
x-csrftoken: {csrf-token}
Required path parameters: zone_id (string)
Required query parameters: None
Required body: None

Example 200 OK response: Uses the Zone response shape shown above.
404 Not Found: {"detail":"Zone not found"}
7.4 Create a Zone
POST /api/zones/
Creates a zone. Requires edit permission.

Mandatory parameters
Required headers:
Cookie: csrftoken={csrf-token}
x-csrftoken: {csrf-token}
Required path parameters: None
Required query parameters: None
Required body fields: name (string). Other writable Zone fields are optional.

Example request body
{"name":"Level 2 Control","desc":"PLC and controller network","purdue_level":2,"target_sl":3,"criticality":4.0,"exposure":2.0,"air_gapped":false}

Example 201 Created response
{"id":"Z-A1B2C3D4","client_id":"client-123","name":"Level 2 Control","desc":"PLC and controller network","purdue_level":2,"target_sl":3,"criticality":4.0,"exposure":2.0,"air_gapped":false,"created_at":"2026-09-22T10:00:00Z"}

A duplicate client-scoped zone name can return X-Duplicate-Name: true; creation still succeeds.
7.5 Update a Zone
PATCH /api/zones/{zone_id}
Updates a zone. Requires edit permission.

Mandatory parameters
Required headers:
Cookie: csrftoken={csrf-token}
x-csrftoken: {csrf-token}
Required path parameters: zone_id (string)
Required query parameters: None
Required body: Valid Zone update object; no individual field is mandatory.

Example request body
{"target_sl":4,"air_gapped":true}

200 OK: Returns the updated Zone.
404 Not Found: {"detail":"Zone not found"}
7.6 Batch Update Zones
PATCH /api/zones/batch
Atomically updates 1–100 zones. Requires edit permission.

Mandatory parameters
Required headers:
Cookie: csrftoken={csrf-token}
x-csrftoken: {csrf-token}
Required path parameters: None
Required query parameters: None
Required body fields: updates array; each item requires zone_id and changes.

Example request body
{"updates":[{"zone_id":"Z-A1B2C3D4","changes":{"target_sl":3}},{"zone_id":"Z-E5F6A7B8","changes":{"air_gapped":true,"desc":"Isolated historian"}}]}

200 OK: {"zones":[...updated zone objects...]}
404 Not Found: {"detail":"One or more zones not found"}. No partial update is committed.
7.7 Apply or Clear an Override
POST /api/zones/{zone_id}/override/
Applies an override. Requires edit permission. The optional reason supports up to 2,000 characters.

Required headers:
Cookie: csrftoken={csrf-token}
x-csrftoken: {csrf-token}
Other mandatory parameters: zone_id path parameter and valid JSON body.
Example request: {"reason":"Approved during maintenance window"}
201 Created: {"zone_id":"Z-A1B2C3D4","override_applied":true,"override_reason":"Approved during maintenance window"}

DELETE /api/zones/{zone_id}/override/
Clears the override. Requires edit permission.
Required headers:
Cookie: csrftoken={csrf-token}
x-csrftoken: {csrf-token}
Other mandatory parameters: zone_id path parameter. No body.
Success: 204 No Content
404 for either operation: {"detail":"Zone not found"}
7.8 Preview or Delete a Zone
GET /api/zones/{zone_id}/delete-preview
Required headers:
Cookie: csrftoken={csrf-token}
x-csrftoken: {csrf-token}
Other mandatory parameters: zone_id path parameter. No body.
200 OK: {"zone_id":"Z-A1B2C3D4","zone_name":"Level 2 Control","asset_count":12,"conduit_count":3}

DELETE /api/zones/{zone_id}
Deletes the zone. Requires admin permission.
Required headers:
Cookie: csrftoken={csrf-token}
x-csrftoken: {csrf-token}
Other mandatory parameters: zone_id path parameter. No body.
Success: 204 No Content. Associated conduits are removed and mapped assets are detached.
404 for either operation: {"detail":"Zone not found"}
7.9 Check Air-Gap Consistency
GET /api/zones/{zone_id}/air-gap-check
Required headers:
Cookie: csrftoken={csrf-token}
x-csrftoken: {csrf-token}
Other mandatory parameters: zone_id path parameter. No body.
200 OK: {"air_gapped":true,"contradictions":["Zone has an active conduit despite being marked air-gapped."]}
An empty contradictions array indicates no detected conflict.
404 Not Found: {"detail":"Zone not found"}
7.10 List Zone Rules
GET /api/zones/{zone_id}/rules
Required headers:
Cookie: csrftoken={csrf-token}
x-csrftoken: {csrf-token}
Other mandatory parameters: zone_id path parameter. No body.
200 OK: [{"id":"c50404f2-d4bd-4f2a-80e7-776ab02fd337","client_id":"client-123","zone_id":"Z-A1B2C3D4","cidr":"10.20.0.0/24","name":"Control VLAN","created_at":"2026-09-22T10:20:00Z"}]
404 Not Found: {"detail":"Zone not found"}
7.11 Create a Zone Rule
POST /api/zones/{zone_id}/rules
Creates a normalized CIDR rule. Requires edit permission.

Required headers:
Cookie: csrftoken={csrf-token}
x-csrftoken: {csrf-token}
Other mandatory parameters: zone_id path parameter and cidr body field. name is optional.
Example request: {"cidr":"10.20.0.14/24","name":"Control VLAN"}
201 Created: {"id":"c50404f2-d4bd-4f2a-80e7-776ab02fd337","client_id":"client-123","zone_id":"Z-A1B2C3D4","cidr":"10.20.0.0/24","name":"Control VLAN","created_at":"2026-09-22T10:21:00Z"}
404: Zone not found.
409: CIDR overlaps another zone’s rule.
422: CIDR is invalid, /0, or already mapped for the client.
7.12 Delete a Zone Rule
DELETE /api/zone-rules/{rule_id}
Requires admin permission.
Required headers:
Cookie: csrftoken={csrf-token}
x-csrftoken: {csrf-token}
Other mandatory parameters: rule_id path parameter. No body.
Success: 204 No Content
404 Not Found: {"detail":"Zone rule not found"}
7.13 List Conduits
GET /api/conduits/
Required headers:
Cookie: csrftoken={csrf-token}
x-csrftoken: {csrf-token}
Other mandatory parameters: No path parameters, query parameters, or body.
200 OK: [{"id":"d0e8d2fe-098e-4d45-8f3b-9bba9b9e6e04","client_id":"client-123","from_zone_id":"Z-A1B2C3D4","to_zone_id":"Z-E5F6A7B8","name":"Historian data flow","protocols":["OPC UA","HTTPS"],"created_at":"2026-09-22T10:30:00Z"}]
7.14 Create a Conduit
POST /api/conduits/
Requires edit permission.
Required headers:
Cookie: csrftoken={csrf-token}
x-csrftoken: {csrf-token}
Other mandatory parameters: from_zone_id and to_zone_id body fields.
Example request: {"from_zone_id":"Z-A1B2C3D4","to_zone_id":"Z-E5F6A7B8","name":"Historian data flow","protocols":["OPC UA","HTTPS"]}
201 Created: Returns the created Conduit.
404: Either zone does not exist for the client.
422: Source and destination are identical, or the pair already has a conduit.
7.15 Delete a Conduit
DELETE /api/conduits/{conduit_id}
Requires admin permission.
Required headers:
Cookie: csrftoken={csrf-token}
x-csrftoken: {csrf-token}
Other mandatory parameters: conduit_id path parameter. No body.
Success: 204 No Content
404 Not Found: {"detail":"Conduit not found"}
8. Evidence
8.1 Evidence API Reference
Base router prefix: /api/model/evidence.
The Evidence feature manages the tenant-scoped evidence checklist, findings, blind spots, group summaries, and evidence-drop scans.
Method	Endpoint	Description
GET	/api/model/evidence/	Lists the evidence checklist and progress
GET	/api/model/evidence/findings/	Lists evidence findings and blind spots
PUT	/api/model/evidence/{item_id}/	Updates an evidence item
GET	/api/model/evidence/groups/	Lists evidence group summaries
POST	/api/model/evidence/scan/	Scans all evidence groups
POST	/api/model/evidence/scan/{group_id}/	Scans one evidence group

Authentication, CSRF, permissions, and client scope
Evidence reads use the authenticated user's client scope. Evidence writes require the edit permission. Invalid or missing authentication returns 401; authenticated users without edit receive 403.

There are no query parameters on these routes. All non-GET requests require both CSRF headers:
Cookie: csrftoken={csrf-token}
x-csrftoken: {csrf-token}
Evidence values
status: pending, received, unavailable, or na. A status update is optional when quality is supplied.
quality: complete or partial. Setting quality automatically sets status to received.

Evidence groups are docs, inv, network, access, ops, and people.
8.2 List Evidence Checklist
GET /api/model/evidence/
Returns the evidence checklist for the authenticated client, divided into received and missing items, with overall progress information.

Mandatory parameters
Required headers: None beyond authenticated access
Required path parameters: None
Required query parameters: None
Required body: None

Example 200 OK response
{
  "received": [{"id":"net-diagram","group":"docs","name":"Network diagrams + IP/VLAN scheme","owner":"IT","effort":"30 min","core":false,"fallback":"Reconstruct from switch and firewall configs.","finding":null,"evidences":["FR5"],"quality":"complete"}],
  "missing": [{"id":"asset-inventory","group":"inv","name":"Asset inventory","owner":"Controls / IT","status":"pending"}],
  "progress": {"total":16,"received":1,"unavailable":0,"na":0,"resolved":1,"pending":15,"pct":6,"core_missing":["asset-inventory"]}
}

The catalogue item fields are sourced from the shared domain configuration. The exact catalogue can grow without changing this route.
8.3 List Evidence Findings and Blind Spots
GET /api/model/evidence/findings/
Returns evidence findings and blind spots for the authenticated client.

Mandatory parameters
Required headers: None beyond authenticated access
Required path parameters: None
Required query parameters: None
Required body: None

Example 200 OK response
{
  "findings": [{"id":"network-config","name":"Network configuration","finding":"Network configuration evidence is unavailable.","evidences":["FR5"]}],
  "blind_spots": [{"id":"training-records","name":"Training records","fallback":"Confirm the process with the controls owner."}]
}
8.4 Update an Evidence Item
PUT /api/model/evidence/{item_id}/
Updates the status or quality of an evidence item. Requires edit permission.

Mandatory parameters
Required headers:
Cookie: csrftoken={csrf-token}
x-csrftoken: {csrf-token}
Content-Type: application/json
Required path parameters: item_id
Required query parameters: None
Required body fields: At least one of status or quality

Example request body
{"status":"received","quality":"partial"}

Example 200 OK response
{"item_id":"network-config","status":"received","quality":"partial"}

A quality update sets the item status to received. If a status other than received is set, any existing quality is cleared.

404 Not Found: item_id is not in the evidence catalogue.
422 Unprocessable Entity: Invalid status, invalid quality, or neither field supplied.
8.5 List Evidence Groups
GET /api/model/evidence/groups/
Returns the six evidence group tiles and their current progress and scan states.

Mandatory parameters
Required headers: None beyond authenticated access
Required path parameters: None
Required query parameters: None
Required body: None

Example 200 OK response
{
  "groups": [{"id":"docs","name":"Documentation & architecture","owner":"IT / Compliance","total":3,"received":1,"pct":33,"coreTotal":1,"corePending":0,"priority":true,"changed":false,"running":false,"conflicts":[],"lastScannedAt":null,"items":[]}],
  "progress": {},
  "empty": false
}

The items array contains the catalogue item fields plus the current status and quality. lastScannedAt is an ISO 8601 timestamp or null.
8.6 Scan All Evidence Groups
POST /api/model/evidence/scan/
Starts a background scan for all evidence groups. Requires edit permission.

Mandatory parameters
Required headers:
Cookie: csrftoken={csrf-token}
x-csrftoken: {csrf-token}
Required path parameters: None
Required query parameters: None
Required body: None

Example 200 OK response
{"started":true,"groups":{"docs":{"group_id":"docs","running":true},"inv":{"group_id":"inv","running":true}}}

If a scan is already running or inside the cooldown window, the request is idempotent and returns 200 OK with started set to false and the current group state.
8.7 Scan One Evidence Group
POST /api/model/evidence/scan/{group_id}/
Starts a background scan for one evidence group. Requires edit permission.

Mandatory parameters
Required headers:
Cookie: csrftoken={csrf-token}
x-csrftoken: {csrf-token}
Required path parameters: group_id
Required query parameters: None
Required body: None

Valid group IDs are docs, inv, network, access, ops, and people. The response has the same shape as scan-all, limited to the requested group.

404 Not Found: group_id is not an evidence group.

9. Compliance
9.1 Compliance API Reference
Base router prefix: /api/compliance.
The Compliance feature manages IEC 62443 functional requirements, system requirements, assessment statuses, summaries, diagrams, and applicable requirements for zones and conduits.
Method	Endpoint	Description
GET	/api/compliance/fr	Lists functional requirements
GET	/api/compliance/sr	Lists system requirements
GET	/api/compliance/status	Lists SR statuses
PUT	/api/compliance/status/{zone_id}/{sr_id}	Sets an SR status
GET	/api/compliance/summary	Gets compliance summaries
GET	/api/compliance/diagram	Gets the compliance diagram
GET	/api/compliance/zones/{zone_id}/requirements	Gets applicable zone requirements
GET	/api/compliance/conduits/{conduit_id}/requirements	Gets applicable conduit requirements

Authentication, request headers, and client scope
The current compliance router uses the development client ID dev-client-001 internally and does not currently declare an authentication or permission dependency. Production authentication should be added before these routes are exposed as tenant-isolated APIs.

The current routes do not require CSRF headers because the router does not use the shared edit-user dependency. The status update is a PUT operation and should be protected when production authentication is added. Optional query parameters are documented per endpoint.
Data models
Functional requirement: fr (string identifier such as FR1); name (string).
System requirement: id (string); fr (parent functional requirement); name (string); min_sl (integer); is_enhancement (boolean); parent_sr_id (string or null).
Status: client_id (string); zone_id (string); sr_id (string); status (intended values: met, partial, missing, or blocked); evidence_refs (string array, default []); assessed_at (server-generated ISO 8601 datetime); assessed_by (currently consultant).
9.2 List Functional Requirements
GET /api/compliance/fr
Returns the IEC 62443 functional-requirement catalogue.

Mandatory parameters
Required headers: None
Required path parameters: None
Required query parameters: None
Required body: None

Example 200 OK response
[{"fr":"FR1","name":"Identification and authentication control"}]
9.3 List System Requirements
GET /api/compliance/sr?fr=FR1
Returns the system-requirement catalogue. The optional fr query parameter filters requirements by functional requirement.

Mandatory parameters
Required headers: None
Required path parameters: None
Required query parameters: None; fr is optional
Required body: None

Example 200 OK response
[{"id":"SR1.1","fr":"FR1","name":"Human user identification and authentication","min_sl":1,"is_enhancement":false,"parent_sr_id":null}]
9.4 List SR Statuses
GET /api/compliance/status?zone_id=Z-A1B2C3D4
Returns system-requirement assessment statuses. The optional zone_id query parameter filters statuses to one zone.

Mandatory parameters
Required headers: None
Required path parameters: None
Required query parameters: None; zone_id is optional
Required body: None

Example 200 OK response
[{"client_id":"dev-client-001","zone_id":"Z-A1B2C3D4","sr_id":"SR1.1","status":"met","evidence_refs":["network-config"],"assessed_at":"2026-09-23T10:00:00Z","assessed_by":"consultant"}]
9.5 Set an SR Status
PUT /api/compliance/status/{zone_id}/{sr_id}
Creates or updates an assessment status for a system requirement in a zone.

Mandatory parameters
Required headers:
Cookie: csrftoken={csrf-token}
x-csrftoken: {csrf-token}
Content-Type: application/json
Required path parameters: zone_id and sr_id
Required query parameters: None
Required body fields: status; evidence_refs is optional and defaults to []

Example request body
{"status":"partial","evidence_refs":["network-config","firewall-rules"]}

Example 200 OK response
{"client_id":"dev-client-001","zone_id":"Z-A1B2C3D4","sr_id":"SR1.1","status":"partial","evidence_refs":["network-config","firewall-rules"],"assessed_at":"2026-09-23T10:05:00Z","assessed_by":"consultant"}

The current model types status as a string and does not enforce the intended values. Clients should use met, partial, missing, or blocked. The route currently does not require CSRF headers but should be protected before production use.
9.6 Get Compliance Summary
GET /api/compliance/summary
Returns one compliance summary per zone.

Mandatory parameters
Required headers: None
Required path parameters: None
Required query parameters: None
Required body: None

Example 200 OK response
[{"zone_id":"Z-A1B2C3D4","zone_name":"Level 2 Control","target_sl":3,"achieved_sl":2,"coverage_pct":67,"met_count":12,"partial_count":3,"missing_count":4,"total_required":19}]

achieved_sl is derived from requirements marked met. coverage_pct is the percentage of applicable requirements marked met.
9.7 Get Compliance Diagram
GET /api/compliance/diagram
Returns zones, conduits, and current system-requirement statuses for diagram rendering.

Mandatory parameters
Required headers: None
Required path parameters: None
Required query parameters: None
Required body: None

Example 200 OK response
{"zones":[{"id":"Z-A1B2C3D4","name":"Level 2 Control","desc":"PLC and controller network","purdue_level":2,"target_sl":3,"actual_sl":2,"criticality":4.0,"exposure":2.0,"internet_facing":false,"air_gapped":false}],"conduits":[{"id":"d0e8d2fe-098e-4d45-8f3b-9bba9b9e6e04","name":"Historian data flow","from":"Z-A1B2C3D4","to":"Z-E5F6A7B8","protocols":["OPC UA"]}],"statuses":[{"zone_id":"Z-A1B2C3D4","sr_id":"SR1.1","status":"met"}]}
9.8 Get Zone Requirements
GET /api/compliance/zones/{zone_id}/requirements
Returns the applicable requirements for a zone, grouped by functional-requirement theme.

Mandatory parameters
Required headers: None
Required path parameters: zone_id
Required query parameters: None
Required body: None

Example 200 OK response
{"zone_id":"Z-A1B2C3D4","zone_name":"Level 2 Control","target_sl":3,"achieved_sl":2,"themes":[{"fr":"FR1","name":"Identification and authentication control","achieved_sl":2,"requirements":[{"id":"SR1.1","name":"Human user identification and authentication","fr":"FR1","min_sl":1,"is_enhancement":false,"parent_sr_id":null,"status":"met","evidence_refs":["network-config"]}]}]}

404 Not Found: {"detail":"Zone not found"}
9.9 Get Conduit Requirements
GET /api/compliance/conduits/{conduit_id}/requirements
Returns the applicable requirements for a conduit.

Mandatory parameters
Required headers: None
Required path parameters: conduit_id
Required query parameters: None
Required body: None

Example 200 OK response
{"conduit_id":"d0e8d2fe-098e-4d45-8f3b-9bba9b9e6e04","conduit_name":"Historian data flow","target_sl":3,"achieved_sl":2,"themes":[]}

404 Not Found: {"detail":"Conduit not found"}


10. Assets
10.1 Assets API Reference
Base router prefix: /api/assets.
The Assets feature manages tenant-scoped asset inventory records and internet-facing asset suggestions.
Method	Endpoint	Description
GET	/api/assets/	Lists assets, optionally filtered by zone
GET	/api/assets/{asset_id}	Gets an asset
POST	/api/assets/	Creates an asset
PATCH	/api/assets/{asset_id}	Updates an asset
DELETE	/api/assets/{asset_id}	Deletes an asset
GET	/api/assets/internet-facing-suggestions/	Lists internet-facing suggestions
POST	/api/assets/internet-facing-suggestions/{asset_id}/confirm/	Confirms an internet-facing suggestion
POST	/api/assets/internet-facing-suggestions/{asset_id}/dismiss/	Dismisses an internet-facing suggestion

Authentication, CSRF, permissions, and client scope
Asset reads use the authenticated user's client scope. Asset writes require the edit permission; deletions require the admin permission. Invalid or missing authentication returns 401; authenticated users without the required permission receive 403.

There are no query parameters except where noted. All non-GET requests require both CSRF headers:
Cookie: csrftoken={csrf-token}
x-csrftoken: {csrf-token}
Asset data model
id: string; server-generated and returned only.
client_id: string; server-derived and returned only.
zone_id: string or null; defaults to null.
zone_assign_method: string or null; returned only.
zone_unplaced_code: string or null; returned only.
hostname: string; defaults to an empty string; maximum 255 characters.
ip: IPv4 or IPv6 string; defaults to an empty string; maximum 45 characters.
vendor, model, firmware, os: strings; default to empty strings; maximum 255 characters each.
device_type: string; defaults to an empty string; maximum 100 characters.
purdue_level: integer from 0 to 5; defaults to 3.
confidence: integer from 0 to 100; defaults to 0.
shadow: boolean; defaults to false.
internet_facing: boolean; defaults to false.

PATCH requests accept any subset of writable fields. Omitted properties remain unchanged.
10.2 List Assets
GET /api/assets/?zone_id=Z-A1B2C3D4
Returns assets for the authenticated client. The optional zone_id query parameter limits results to assets assigned to that zone.

Mandatory parameters
Required headers: None beyond authenticated access
Required path parameters: None
Required query parameters: None; zone_id is optional
Required body: None

Example 200 OK response
[{"id":"asset-001","client_id":"client-123","zone_id":"Z-A1B2C3D4","zone_assign_method":"rule","zone_unplaced_code":null,"hostname":"plc-01","ip":"10.20.30.40","vendor":"Siemens","model":"S7-1200","firmware":"3.0.1","device_type":"PLC","os":"","purdue_level":2,"confidence":85,"shadow":false,"internet_facing":false}]
10.3 Get an Asset
GET /api/assets/{asset_id}
Returns one asset for the authenticated client.

Mandatory parameters
Required headers: None beyond authenticated access
Required path parameters: asset_id
Required query parameters: None
Required body: None

200 OK: Returns one asset using the list-response shape.
404 Not Found: {"detail":"Asset not found"}
10.4 Create an Asset
POST /api/assets/
Creates an asset. Requires edit permission. All body fields are optional and use the defaults documented in the asset data model.

Mandatory parameters
Required headers:
Cookie: csrftoken={csrf-token}
x-csrftoken: {csrf-token}
Content-Type: application/json
Required path parameters: None
Required query parameters: None
Required body: A JSON object; no individual field is required

Example request body
{"hostname":"historian-01","ip":"10.20.40.50","vendor":"Aspen Tech","model":"InfoPlus.21","device_type":"Historian","purdue_level":2,"confidence":90,"zone_id":"Z-A1B2C3D4"}

201 Created: Returns the new asset object.
10.5 Update an Asset
PATCH /api/assets/{asset_id}
Updates an asset. Requires edit permission. Supply only the fields to update.

Mandatory parameters
Required headers:
Cookie: csrftoken={csrf-token}
x-csrftoken: {csrf-token}
Content-Type: application/json
Required path parameters: asset_id
Required query parameters: None
Required body: A JSON object; no individual field is required

Example request body
{"confidence":95,"internet_facing":false}

200 OK: Returns the updated asset object.
404 Not Found: {"detail":"Asset not found"}
10.6 Delete an Asset
DELETE /api/assets/{asset_id}
Deletes an asset. Requires admin permission.

Mandatory parameters
Required headers:
Cookie: csrftoken={csrf-token}
x-csrftoken: {csrf-token}
Required path parameters: asset_id
Required query parameters: None
Required body: None

Success: 204 No Content
404 Not Found: {"detail":"Asset not found"}
10.7 List Internet-Facing Suggestions
GET /api/assets/internet-facing-suggestions/
Returns asset suggestions that may be internet-facing.

The current implementation uses a development client ID placeholder rather than the authenticated user's client. Production authentication should be added before this route is exposed.

Mandatory parameters
Required headers: None
Required path parameters: None
Required query parameters: None
Required body: None

Example 200 OK response
[{"id":"asset-042","hostname":"gateway-01","kind":"dns-lookups","device_type":"Network appliance","zone_id":"Z-A1B2C3D4","purdue_level":1}]

The kind field identifies how the suggestion was derived, such as dns-lookups or traffic-pattern.
10.8 Confirm an Internet-Facing Suggestion
POST /api/assets/internet-facing-suggestions/{asset_id}/confirm/
Confirms a suggestion and marks the asset as internet-facing. The current route uses a development client ID placeholder and should receive production authentication before exposure.

Mandatory parameters
Required headers:
Cookie: csrftoken={csrf-token}
x-csrftoken: {csrf-token}
Required path parameters: asset_id
Required query parameters: None
Required body: None

200 OK: Returns the updated asset object with internet_facing set to true.
404 Not Found: {"detail":"Asset not found"}
10.9 Dismiss an Internet-Facing Suggestion
POST /api/assets/internet-facing-suggestions/{asset_id}/dismiss/
Dismisses an internet-facing suggestion. The current route uses a development client ID placeholder and should receive production authentication before exposure.

Mandatory parameters
Required headers:
Cookie: csrftoken={csrf-token}
x-csrftoken: {csrf-token}
Required path parameters: asset_id
Required query parameters: None
Required body: None

Success: 204 No Content
404 Not Found: {"detail":"Asset not found"}


