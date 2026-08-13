type CronEnvironment = {
  RETRACE_BEARER_TOKEN?: string;
  DEEPLOG_CRON_SECRET?: string;
};

async function requireSuccessfulResponse(
  response: Response,
  operation: string
): Promise<string> {
  const resultText = await response.text();
  if (!response.ok) {
    throw new Error(`${operation} failed (${response.status}): ${resultText}`);
  }
  return resultText;
}

export default {
  async scheduled(
    _event: ScheduledEvent,
    env: CronEnvironment,
    _ctx: ExecutionContext
  ) {
    const currentHour = new Date().getUTCHours();

    try {
      const response = await fetch("https://timetracking.live/api/metrics");
      await requireSuccessfulResponse(response, "Metrics refresh");
      console.log("Triggered timetracking.live/api/metrics");
    } catch (error) {
      console.error("Error triggering timetracking.live:", error);
    }

    try {
      const response = await fetch(
        "http://prod-dashboard-server-production.up.railway.app/api/cron/todoist",
        { method: "POST" }
      );
      await requireSuccessfulResponse(response, "Todoist cron");
      console.log("Triggered todoist endpoint");
    } catch (error) {
      console.error("Error triggering todoist endpoint:", error);
    }

    let feedbackSync = false;
    try {
      if (!env.RETRACE_BEARER_TOKEN) {
        console.warn("Skipping feedback sync: RETRACE_BEARER_TOKEN is not set");
      } else {
        const response = await fetch("https://retrace.to/api/feedback/sync", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.RETRACE_BEARER_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });
        const resultText = await requireSuccessfulResponse(
          response,
          "Feedback sync"
        );
        feedbackSync = true;
        console.log("Triggered retrace feedback sync:", resultText);
      }
    } catch (error) {
      console.error("Error triggering retrace feedback sync:", error);
    }

    let taskExtraction = false;
    if (currentHour % 3 === 0) {
      console.log(`Running task extraction at hour ${currentHour}`);
      try {
        if (!env.DEEPLOG_CRON_SECRET) {
          throw new Error("DEEPLOG_CRON_SECRET is not set");
        }
        const response = await fetch(
          "https://deeplog.app/api/cron/extract-tasks",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${env.DEEPLOG_CRON_SECRET}`,
            },
            body: JSON.stringify({}),
          }
        );
        const resultText = await requireSuccessfulResponse(
          response,
          "Task extraction"
        );
        taskExtraction = true;
        console.log("Task extraction result:", resultText);
      } catch (error) {
        console.error("Error running task extraction:", error);
      }
    } else {
      console.log(
        `Skipping task extraction at hour ${currentHour} (not a multiple of 3)`
      );
    }

    let scopeAdjustment = false;
    if (currentHour % 6 === 0) {
      console.log(`Running scope adjustment calculation at hour ${currentHour}`);
      try {
        const response = await fetch(
          "https://timetracking.live/api/calculate-scope-adjustments",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          }
        );
        const resultText = await requireSuccessfulResponse(
          response,
          "Scope adjustment"
        );
        const result = JSON.parse(resultText) as {
          success?: boolean;
          updated_count?: number;
          total_removed_duration?: number;
          removed_event_ids?: unknown[];
          error?: string;
        };
        if (!result.success) {
          throw new Error(result.error || "Scope adjustment returned failure");
        }
        scopeAdjustment = true;
        console.log("Scope adjustment result:", result);
      } catch (error) {
        console.error("Error running scope adjustment:", error);
      }
    } else {
      console.log(
        `Skipping scope adjustment at hour ${currentHour} (not a multiple of 6)`
      );
    }

    return {
      success: true,
      hour: currentHour,
      tasksRun: {
        metrics: true,
        todoist: true,
        feedbackSync,
        taskExtraction,
        scopeAdjustment,
      },
    };
  },
};
