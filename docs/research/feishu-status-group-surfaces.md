# Mainland Feishu group status surfaces — research notes

Research date: 2026-11-05. Scope: official mainland Feishu first-party documentation for group announcements, group tabs, widgets, group sidebar and APIs, especially persistent visibility and programmatic updates.

## Verified findings

- The [create group tab API](https://open.feishu.cn/document/server-docs/group/chat-tab/create?lang=zh-CN) supports creating document and URL tabs, with a maximum of 20; the bot must be enabled and in the group, and administrator controls apply. A tab provides a durable navigation entry, but this source does not establish that its contents stay continuously visible while chatting.
- The same tab documentation lists update, delete, reorder and list operations, and its limit error recommends updating or deleting an existing tab. Their exact methods and supported mutations were not checked. Its permission error mentions group settings for tabs, menus and widgets; that is not evidence of a widget API.
- The [upgraded group announcement overview](https://open.feishu.cn/document/group/upgraded-group-announcement/group-announcement-overview?lang=zh-CN) describes one document announcement per group and document APIs for block operations (list/get/create/batch-update/delete); support depends on block type. A document ISV widget block is not evidence of a group-sidebar widget API.
- The [legacy announcement patch API](https://open.feishu.cn/document/server-docs/group/chat-announcement/patch?lang=zh-CN) applies to old document announcements, not the upgraded format; use the applicable newer document APIs for upgraded announcements.

## Unknown

Continuous in-chat visibility of announcements and tab contents, group-sidebar and group-widget APIs, tab modification details, client-specific behavior, and all permissions beyond the constraints above remain unverified. Absence of evidence here does not mean a feature or API is unavailable.

## Sources and limitations

The configured web search reported a missing `DEEPSEEK_API_KEY`, and the default `browser-harness` daemon failed to start. A delegated research agent recovered browser access using a named browser and consulted the official pages cited above. Coverage is incomplete; this is documentation research, not a live test of any tenant or client.

No Feishu group or existing card was modified.
