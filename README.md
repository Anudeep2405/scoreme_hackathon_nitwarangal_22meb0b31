# Configurable Workflow Decision Platform

A minimalist, but highly structured Decision Engine API built with **Next.js 15, TypeScript, MongoDB, and Redis**. 
This system allows businesses to process requests through dynamically configured stages and rules, completely removing hardcoded business logic.

## 🚀 Key Technical Highlights
- **Config-Driven Engine:** Rules (`required_field`, `greater_than`, `equals`, `conditional`) and stages are loaded from a registry dynamically.
- **Enterprise Resiliency:** Utilizes **Redis** for active Idempotency tracking (preventing duplicate executions) and **Bull** queues for asynchronous background retry logic with exponential backoffs.
- **Strict Validation & Auditing:** Input payloads are strictly validated using **Zod**, and every single rule evaluation is audited fully natively via **Winston** (console) and **MongoDB** (database records).
- **Test-Driven:** Backed by a full suite of **Jest** e2e tests hitting the Next.js API instance directly.

## 🛠️ Tech Stack
- **Framework:** Next.js 15 (App Router) + TypeScript
- **Database / State:** MongoDB with Mongoose
- **Queues / Cache:** Redis + Bull
- **Validation:** Zod
- **Logging:** Winston
- **Testing:** Jest + Supertest

---

## 💻 How to Run Locally

### 1. Prerequisites
You must have **MongoDB** and **Redis** running. If you do not have them installed locally, you can use free cloud alternatives:
- **MongoDB:** Sign up for a free sandbox cluster at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
- **Redis:** Spin up a free serverless Redis instance instantly at [Upstash](https://upstash.com/).

### 2. Environment Setup
Clone the repository and install dependencies:
```bash
npm install
```

Copy the example environment file:
```bash
cp .env.example .env.local
```
Inside `.env.local`, update the variables if you are using cloud URLs:
```env
MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.abcde.mongodb.net/workflow_db
REDIS_URL=rediss://default:<password>@us1-cool-redis-123.upstash.io:32134
```
*(If running Redis and Mongo locally on default ports, the `.env.example` defaults will work perfectly).*

### 3. Start the Server
```bash
npm run dev
```
The Next.js API is now alive at `http://localhost:3000`.

---

## 🧪 Running the Test Suite
Ensure your `.env.local` contains valid connection strings to actively running Redis/Mongo instances, then run:

```bash
npx jest src/tests --forceExit
```
The test suite will automatically execute the following assertions:
1. Rejects invalid inputs missing required config fields (Zod and engine routing).
2. Happy path evaluation across multiple stages.
3. Submitting duplicate payloads returning identically cached idempotency responses.
4. Simulating forced dependency failures leading correctly to HTTP `202` background Queue retries.

---

## 📡 API Endpoints 

### POST `/api/request`
Initiates a new workflow.
**Body:**
```json
{
  "workflowName": "loan_application",
  "idempotencyKey": "unique-request-1234",
  "inputData": {
    "amount": 5000,
    "credit_score": 750,
    "external_verification": "passed"
  }
}
```

### GET `/api/request/:id`
Retrieves the execution status, logs, triggered rules, and final decisions of a specific request.
