# Configurable Workflow Decision Platform

This project is a workflow orchestration product with a built-in admin console for designing, versioning, activating, and testing configurable decision workflows.

Instead of hardcoding approval logic in application code, you define workflows as data:

- stages
- input schema
- rules
- transitions
- stage actions

The platform stores workflow versions, executes requests against the selected workflow, records decision history, and gives you a UI to manage everything from one place.

## What this product does

This product is useful when a team needs business logic that changes often, for example:

- application approval workflows
- claim processing workflows
- employee onboarding workflows
- vendor approval workflows
- document verification workflows

The system lets non-engineers and engineers work from the same structure:

- create workflow versions through a visual builder
- activate the version that should be used by default
- send requests through a guided form or raw JSON
- inspect request history, rule outcomes, and final decisions
- retry transient failures with a Redis-backed Bull queue

## Main features

- Config-driven workflow engine with versioned workflow definitions
- Guided request form generated from each workflow's input schema
- Raw JSON mode for advanced request testing
- Clear workflow version selection in the Requests panel
- Built-in example workflow seeding from a registry
- Request inspection with history, decisions, reasoning, and triggered rules
- Redis-backed idempotency to prevent accidental duplicate execution
- Bull retry queue with exponential backoff for retryable failures
- MongoDB persistence for workflow versions and request audit history

## Key concepts

- Workflow: A named business flow such as `loan_application` or `vendor_approval`.
- Workflow version: A saved snapshot of a workflow config. Saving creates a new version.
- Active version: The default version used when a request does not specify a version.
- Seeding: Copying built-in example workflows from the code registry into the database so they appear in the UI as stored versions.
- Idempotency key: A client-provided key used to avoid creating the same request twice. Reusing the same key returns the earlier request response.

## Built-in example workflows

The UI can seed these example workflows into storage:

- `loan_application`
- `application_approval`
- `claim_processing`
- `employee_onboarding`
- `vendor_approval`
- `document_verification`

Use the `Seed registry defaults` button in the UI to create or refresh these as stored workflow versions.

## UI overview

The homepage loads a workflow console with a sidebar and a focused workspace.

### Sidebar

The sidebar shows the workflow catalog and lets you:

- browse saved workflow versions
- see which version is active
- open the selected workflow in Overview, Builder, or Requests
- activate a stored version

### Overview

The Overview screen is for reading, not editing. It shows:

- stages
- transitions
- input schema
- stage actions
- rules grouped by stage

### Builder

The Builder is where you configure workflows. You can:

- create a starter workflow or blank workflow
- rename the workflow
- add, remove, and reorder stages
- define input fields and validation rules
- add stage actions
- define transitions between stages
- build conditional routing logic
- save a new workflow version

Current rule types:

- `required_field`
- `greater_than`
- `equals`
- `conditional`

Current transition conditions:

- `always`
- `on_success`
- `on_failure`

Current stage action type:

- `fetch_external_score`

### Requests

The Requests screen is used to test saved workflows.

You can:

- choose a saved workflow
- optionally pin a specific version
- use a guided form when the workflow has an input schema
- switch to raw JSON mode when you want full control
- preview the payload being sent
- submit the request
- inspect the resulting request record

Important behavior:

- Requests run saved workflow versions only.
- Unsaved Builder edits do not affect the Requests panel until you save the workflow.
- When you switch workflows or versions, the guided form and sample JSON update to match the selected saved workflow.
- After each successful request, the UI prepares a fresh idempotency key for the next request.

## Local development

### Prerequisites

- Node.js
- MongoDB
- Redis

### Install dependencies

```bash
npm install
```

### Configure environment

This project reads:

I integrated the project with MongoDb Atlas Cloud DB and this is my test url, please use this for deployment - MONGODB_URI=mongodb+srv://Anudeep:Scoremehackathon@scoremehackathon.djpjijo.mongodb.net/?appName=scoremehackathon


- `MONGODB_URI`
- `REDIS_URL`

If you are running MongoDB and Redis locally on default ports, the code already has local defaults:

```env
MONGODB_URI=mongodb://localhost:27017/workflow_platform_dev
REDIS_URL=redis://localhost:6379
NODE_ENV=development
```

You can place overrides in `.env.local`.

### Start the app

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## How to use the UI

### 1. Start with example workflows

If you want sample data right away:

1. Start the app.
2. Open the homepage.
3. Click `Seed registry defaults`.

This creates stored workflow versions from the built-in registry so they become selectable in the catalog and Requests screen.

### 2. Inspect a workflow

1. Pick a workflow in the sidebar.
2. Open `Overview`.
3. Review the stages, transitions, schema, and rules.

### 3. Create or edit a workflow

1. Open `Builder`.
2. Start from `Starter workflow` or `Blank workflow`.
3. Configure stages, fields, rules, transitions, and stage actions.
4. Save the workflow.

Saving creates a new version. It does not overwrite the older version in place.

### 4. Activate a workflow version

Activate the version you want to use as the default when a request does not specify an exact version.

This is useful when:

- you want production to move to a new ruleset
- you want Requests to use the latest approved version by default

### 5. Test a workflow request

1. Open `Requests`.
2. Choose a saved workflow.
3. Optionally choose a pinned version.
4. Fill the guided form or edit the raw JSON.
5. Click `Send workflow request`.

If the workflow has an input schema, the form can render fields automatically.

### 6. Inspect the outcome

After submission, the Requests screen shows:

- request ID
- current status
- current stage
- input payload
- triggered rules
- decisions
- history
- reasoning

## Request statuses

A request can end up in one of these states:

- `processing`
- `approved`
- `rejected`
- `manual_review`
- `error`

`manual_review` is used when the system cannot safely finish the request automatically, such as after retry exhaustion.

## Product architecture

At a high level, the architecture looks like this:

1. The browser loads the workflow console UI.
2. The UI calls Next.js API routes for workflow management and request execution.
3. Workflow configs and request records are stored in MongoDB.
4. Idempotency keys and retry queue infrastructure use Redis.
5. Bull processes retry jobs for retryable failures.
6. The workflow engine evaluates rules, transitions, and branch targets.

### Main application layers

- UI: `src/components/workflow-console.tsx` and child panels
- Page entry: `src/app/page.tsx`
- API routes: `src/app/api/...`
- Workflow config services: `src/services/workflowConfigService.ts`
- Workflow execution engine: `src/services/workflowEngine.ts`
- Request persistence: `src/models/Request.ts`
- Retry queue: `src/queues/retryQueue.ts`

### Request execution flow

When the UI submits a request:

1. `POST /api/request` validates the payload.
2. The API resolves the selected workflow version.
3. Input data is validated against the workflow schema.
4. The idempotency key is checked in Redis.
5. A request document is created in MongoDB with the workflow snapshot.
6. The workflow engine processes the request.
7. If a retryable external failure occurs, the request is placed on the Bull retry queue.
8. The final or current state can be inspected through the Requests panel or `GET /api/request/:id`.

### Why the workflow snapshot matters

Each request stores the workflow snapshot it ran against. That makes audit and debugging easier because a later workflow edit does not change the logic that was used for an earlier request.

## API summary

### `GET /api/workflow-config`

Lists stored workflow configs.

Optional query parameters:

- `name`
- `version`

### `POST /api/workflow-config`

Creates a new stored workflow version.

Example body:

```json
{
  "activate": true,
  "config": {
    "name": "loan_application",
    "stages": ["intake", "scoring", "decision"],
    "inputSchema": {
      "allowUnknown": false,
      "fields": {
        "amount": { "type": "number", "required": true },
        "credit_score": { "type": "number", "required": true }
      }
    },
    "rules": {
      "intake": [
        { "id": "rule_1", "type": "required_field", "field": "amount" }
      ],
      "scoring": [],
      "decision": []
    },
    "transitions": [
      { "from": "intake", "to": "scoring", "condition": "on_success" },
      { "from": "scoring", "to": "decision", "condition": "on_success" }
    ]
  }
}
```

### `POST /api/workflow-config/[name]/activate`

Marks a stored version as the active version for that workflow name.

Example body:

```json
{
  "version": 3
}
```

### `POST /api/workflow-config/seed`

Seeds built-in registry workflows into storage.

Example body:

```json
{
  "activate": true
}
```

You can also seed a subset:

```json
{
  "names": ["application_approval", "vendor_approval"],
  "activate": true
}
```

### `POST /api/request`

Submits a workflow request.

Example body:

```json
{
  "workflowName": "loan_application",
  "workflowVersion": 1,
  "idempotencyKey": "ui-1234567890-abcd1234",
  "inputData": {
    "amount": 5000,
    "credit_score": 740,
    "external_verification": "passed"
  }
}
```

If `workflowVersion` is omitted, the API uses the active version or latest stored version.

### `GET /api/request/[id]`

Returns the stored request details, including:

- input
- status
- current stage
- triggered rules
- decisions
- history
- reasoning



## Testing

### Full test run

Requires MongoDB and Redis to be available:

```bash
npx jest src/tests --runInBand
```

### Lighter-weight targeted tests

For some unit-style tests that do not need external services:

```bash
SKIP_TEST_SERVICES=true npx jest src/tests/retryQueue.test.ts src/tests/workflowConfigService.test.ts --runInBand
```

## Operational notes

- Workflow versions are stored in MongoDB and can be activated independently.
- Idempotency is enforced through Redis and the request record also has a unique idempotency key.
- Retry handling uses Bull with Redis-backed jobs and exponential backoff.
- In the current implementation, the Bull processor is registered inside the app runtime rather than a separate worker process.

## Troubleshooting

### The Requests form does not reflect my Builder changes

Requests only use saved workflow versions. Save the workflow first, then select that saved version in the Requests panel.

### My second request returns the first request again

That usually means the same idempotency key was reused. Reusing a key is treated as the same request by design.

### What does seeding mean

Seeding means copying the built-in example workflows from the code registry into the database so they are available as stored workflow versions in the UI.

