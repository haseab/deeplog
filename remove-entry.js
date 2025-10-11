// Run this in browser console to remove a specific entry from recent timers cache

const CACHE_KEY = "deeplog_recent_timers";

function removeEntryByDescription(description) {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) {
      console.log("No cache found");
      return;
    }

    const timers = JSON.parse(cached);
    const beforeCount = timers.length;

    const filtered = timers.filter(entry => entry.description !== description);
    const afterCount = filtered.length;

    if (beforeCount === afterCount) {
      console.log(`No entries found with description: "${description}"`);
      return;
    }

    localStorage.setItem(CACHE_KEY, JSON.stringify(filtered));
    console.log(`Removed ${beforeCount - afterCount} entry(ies) with description: "${description}"`);
    console.log(`Cache now has ${afterCount} entries`);
  } catch (error) {
    console.error("Failed to remove entry:", error);
  }
}

// Remove the specific entry
removeEntryByDescription("the fact i brought my wallet to WF is pretty cool lol");
