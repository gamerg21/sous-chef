# Optional pantry recipe drafts

Open the account menu and choose **AI settings**. Select OpenAI, Anthropic, or Google AI, enter the exact model ID available to your account, and save a provider key. New keys require `SECRETS_ENCRYPTION_KEY` on the Convex deployment. The web container needs no provider credentials. Selecting a provider changes the household's active provider; all household members use that configuration.

Open **Recipes → New recipe → Idea from pantry**. The explicit Generate action sends inventory names, quantities, units, and your preferences to the selected provider. Its pricing and data policies apply. The result opens in the recipe editor for review and is saved only when you press Save. It can replace the current unsaved draft. Check dietary requirements and preparation instructions yourself.

The implementation makes one request without automatic retries, allows three requests per household per minute, accepts at most 100 pantry batches, limits preferences to 1,000 characters, caps response size and output tokens, and times out after 45 seconds. Invalid, truncated, or refused responses cannot become saved recipes. A connection test checks credentials; it does not guarantee that the selected model is enabled or has available credits.

The adapters follow the official [OpenAI Chat Completions reference](https://developers.openai.com/api/reference/resources/chat), [Anthropic Messages reference](https://platform.claude.com/docs/en/api/http/messages/create), and [Google GenerateContent reference](https://ai.google.dev/api/generate-content). Use a text model supporting the corresponding API and JSON output mode where requested. Model availability changes, so the application uses your chosen model ID rather than a hard-coded recommendation.

Provider responses and error bodies are not logged. New saved keys are encrypted; old plaintext credentials remain readable for migration and should be re-saved after encryption is configured. Snapshot backups do not include the deployment encryption key, so keep that key separately.

Automated checks use mocked provider responses and cover all three formats, incomplete/invalid drafts, timeouts, credential-error redaction, household isolation, and rate limits. A successful real generation with an operator-supplied key remains a release acceptance check. This feature is a one-shot recipe draft; it does not implement a conversational assistant, meal calendar, or autonomous actions.
