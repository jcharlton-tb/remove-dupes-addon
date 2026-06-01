// Async per entry processing
export const ENTRY_CONCURRENCY = 8;

export async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await mapper(items[i], i);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export function normalizeSubject(subject) {
  return String(subject || "(no subject)")
    .trim()
    .replace(/^(re|fw|fwd):\s*/i, "") 
    .toLowerCase();
}

export function normalizeAddressList(addresses, stripAndSort) {
  const list = Array.isArray(addresses) ? addresses : [];

  const normalized = list
    .map((entry) => {
      if (!entry) {
        return "";
      }

      const text = String(entry).trim().toLowerCase();

      if (!stripAndSort) {
        return text;
      }

      const match = text.match(/<([^>]+)>/);
      return match ? match[1].trim() : text;
    })
    .filter(Boolean);

  if (stripAndSort) {
    normalized.sort();
  }

  return normalized.join(",");
}

export function buildSendTimeKey(dateValue, resolution) {
  if (!dateValue) {
    return "";
  }

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(Math.floor(date.getTime() / 1000));

  switch (resolution) {
    case "year":
      return year;
    case "month":
      return `${year}-${month}`;
    case "day":
      return `${year}-${month}-${day}`;
    case "hour":
      return `${year}-${month}-${day} ${hour}`;
    case "minute":
      return `${year}-${month}-${day} ${hour}:${minute}`;
    case "second":
    default:
      return second;
  }
}

export function extractBodyText(part) {
  if (!part) {
    return "";
  }

  if (Array.isArray(part.parts) && part.parts.length > 0) {
    return part.parts.map(extractBodyText).join(" ");
  }

  return part.body || "";
}

export function normalizeBody(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Build a comparison key for a message based on selected fields.
// This is the first run of duplicate detection - body comparison not included

export async function getBodyComparisonKey(messageId) {
  const fullMessage = await browser.messages.getFull(messageId);
  return normalizeBody(extractBodyText(fullMessage));
}

export async function getMessageComparisonData(message, settings) {
  const hdr = await browser.messages.get(message.id);
  const parts = [];

  if (settings.compareSubject) {
    parts.push(`subject:${normalizeSubject(hdr.subject)}`);
  }

  if (settings.compareAuthor) {
    parts.push(`author:${String(hdr.author || "").trim().toLowerCase()}`);
  }

  if (settings.compareRecipients) {
    parts.push(
      `recipients:${normalizeAddressList(
        hdr.recipients,
        settings.stripAndSortAddresses
      )}`
    );
  }

  if (settings.compareCc) {
    parts.push(
      `cc:${normalizeAddressList(
        hdr.ccList,
        settings.stripAndSortAddresses
      )}`
    );
  }

  if (settings.compareSendTime) {
    parts.push(`date:${buildSendTimeKey(hdr.date, settings.sendTimeResolution)}`);
  }

  if (settings.compareMessageId) {
    parts.push(
      `messageId:${String(hdr.headerMessageId || hdr.messageId || "")
        .trim()
        .toLowerCase()}`
    );
  }

  if (settings.compareFolder) {
    parts.push(
      `folder:${String(message.folder?.path || message.folder?.name || "")
        .trim()
        .toLowerCase()}`
    );
  }

  return {
  id: message.id,
  subject: String(hdr.subject || "(no subject)"),
  author: String(hdr.author || ""),
  folder: String(message.folder?.name || message.folder?.path || ""),
  date: hdr.date ? new Date(hdr.date).toLocaleString() : "",
  dateValue: hdr.date ? new Date(hdr.date).getTime() : 0,
  messageId: String(hdr.headerMessageId || hdr.messageId || ""),
  size: hdr.size || message.size || "",
  flags: Array.isArray(message.flags) ? message.flags : [],
  key: parts.join("|"),
  };
}

// Second run: refine duplicate groups by comparing message bodies.
// Only runs if body comparison is enabled to avoid fetching full messages
export async function filterGroupsByBody(groups) {
  const bodyFilteredGroups = [];

  for (const group of groups) {
    if (group.messages.length < 2) {
      continue;
    }

    const bodyGroups = new Map();

    for (const message of group.messages) {
      try {
        const bodyKey = await getBodyComparisonKey(message.id);

        if (!bodyGroups.has(bodyKey)) {
          bodyGroups.set(bodyKey, {
            subject: group.subject,
            author: group.author,
            folder: group.folder,
            date: group.date,
            dateValue: group.dateValue,
            count: 0,
            originalCount: 0,
            messageIds: [],
            messages: [],
          });
        }

        const bodyGroup = bodyGroups.get(bodyKey);
        bodyGroup.count += 1;
        bodyGroup.messageIds.push(message.id);
        bodyGroup.messages.push(message);

        if (message.isOriginal) {
          bodyGroup.originalCount += 1;
        }
      } catch (error) {
        console.warn("Failed to compare message body", message.id, error);
      }
    }

    bodyFilteredGroups.push(
      ...[...bodyGroups.values()].filter((bodyGroup) => bodyGroup.count > 1)
    );
  }

  return bodyFilteredGroups;
}