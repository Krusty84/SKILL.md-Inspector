---
name: kubernetes-cluster-log-analyzer-and-incident-response-assistant-tool
description: Analyze Kubernetes pod and node logs to find the root cause of crashes, restarts, and OOM kills. Use when the user shares kubectl logs, describes CrashLoopBackOff or Pending pods, or asks why a deployment is unhealthy.
---

# K8s Log Analyzer

Work from evidence in the cluster, not from guesses about it.

## Workflow

1. Establish the blast radius: `kubectl get pods -A | grep -v Running` — one
   pod, one namespace, or cluster-wide changes the diagnosis entirely.
2. For a failing pod, read in this order: `kubectl describe pod` events,
   previous-container logs (`kubectl logs --previous`), then current logs.
   Exit code 137 is an OOM kill or eviction, not an application bug.
3. Correlate timestamps with recent rollouts (`kubectl rollout history`) and
   node events before blaming the application.
4. Summarize the failure chain for the user: trigger → mechanism → fix.

## Rules

- Read-only by default: never delete pods or edit resources while diagnosing
  unless the user asks for the fix to be applied.
- Quote the exact log lines the diagnosis rests on.
