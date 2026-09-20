# Optional AI recipe drafts

The kitchen works without AI. In AI settings choose OpenAI, Anthropic, or Google,
enter your own API key and exact model ID, then choose Recipes → New recipe →
Idea from pantry. Review the draft before saving.

Requests send pantry ingredient names, quantities, units, and stated preferences
to the selected provider. The provider may bill your account. Requests have a
bounded timeout and local household rate limits. Provider keys are encrypted in
SQLite using the generated `data/secrets.key` (or an explicit
`SECRETS_ENCRYPTION_KEY`). Back up the key with the database.

AI credentials never go to the recipe community. Demo identities cannot configure
or invoke AI. Conversational assistants and automatic meal planning are not implemented.
