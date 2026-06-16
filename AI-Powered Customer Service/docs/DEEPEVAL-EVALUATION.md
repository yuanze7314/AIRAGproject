# DeepEval Evaluation Notes

This project uses DeepEval as a local evaluation harness for the AirBuds Pro X
customer-service agent.

## What The DeepSeek Judge Measures

Because this project is limited to the DeepSeek API, DeepSeek is used as the
evaluation judge model. This does not mean the evaluation is benchmarking
DeepSeek itself. Instead, DeepSeek reads the conversation transcript, runtime
metadata, retrieved context, route/status fields, and expected outcome, then
scores whether this customer-service agent behaved correctly.

In this project, the judge checks whether ordinary questions stay in the
general-service flow, after-sales issues enter the after-sales flow, vague
messages trigger clarification, and high-risk disputes are handled conservatively
or handed off. It also checks that the customer-visible reply avoids unsafe
commitments such as refund, compensation, reshipment, replacement, approval, or
final liability.

The app can keep using its own `DEEPSEEK_MODEL` from `.env.local`. The eval
judge is configured separately through `DEEPEVAL_DEEPSEEK_MODEL`, defaulting to
`deepseek-chat` for more reliable structured JSON scoring.

## Local-First Setup

The first evaluation round is local only:

- No Confident AI upload.
- No production monitoring.
- No hosted dashboard.
- The test calls the local `/api/chat` endpoint and evaluates the real LangGraph
  response.

Run the dataset builder:

```powershell
npm run eval:dataset
```

Run the eval suite:

```powershell
$env:CUSTOMER_SERVICE_BASE_URL="http://127.0.0.1:3001"
$env:DEEPEVAL_DEEPSEEK_MODEL="deepseek-chat"
& "E:\Agent项目\.venvs\ai-customer-service-deepeval\Scripts\deepeval.exe" test run tests/evals/test_airbuds_customer_service.py --identifier "airbuds-local-round-1" --ignore-errors --skip-on-missing-params --display failing
```

## What Uploading Means

Uploading results to Confident AI means sending the eval run results, scores,
reasons, and optionally trace/report history to DeepEval's hosted Confident AI
service. It is useful when the team wants shared reports, run history,
dashboards, human annotations, online evals, and production monitoring.

For the current phase, keep everything local. Upload can be enabled later with
`deepeval login` or `CONFIDENT_API_KEY` if hosted reports become useful.
