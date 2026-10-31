# ai-infra-support-agent

AI hosting support that can safely act: the AI investigates and proposes, code executes only after the customer presses a button, with a snapshot and one-click rollback. Full plan: [PLAN.md](PLAN.md).

```bash
cp .env.example .env      # GOOGLE_GENERATIVE_AI_API_KEY
docker compose up --build # core API + dashboard on http://localhost:3000
npm run chat              # terminal chat instead of Telegram (start with /link 1234)
npm test                  # policy tests, no LLM
```

Bot ↔ core contract: PLAN.md §10.
