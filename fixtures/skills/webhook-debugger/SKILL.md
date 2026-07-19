---
name: webhook-debugger
description: Debug failing webhooks. Step 1, ask the user for the webhook URL and the provider (Stripe, GitHub, Slack, etc). Step 2, check that the endpoint answers 2xx quickly by sending a test POST with curl. Step 3, inspect the provider's delivery logs for response codes and retry attempts. Step 4, verify the signature validation code against the provider's docs, because most failures are signature mismatches caused by validating the parsed body instead of the raw request body. Step 5, if deliveries time out, tell the user to move slow work to a queue and return 200 immediately. Step 6, replay a failed delivery and confirm it is processed end to end. Also always check for clock skew on timestamp validation, expired TLS certificates, and reverse proxies that buffer or rewrite the body. Always tell the user which step found the problem. Use this skill whenever webhooks are mentioned in any way.
---

# Webhook Debugger

Follow the steps in the description above.
