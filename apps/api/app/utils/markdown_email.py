"""Markdown → email HTML conversion with basic styling."""

import markdown


def markdown_to_email_html(md_content: str, title: str = "") -> str:
    body_html = markdown.markdown(
        md_content, extensions=["extra", "codehilite", "tables", "toc"]
    )
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, sans-serif; max-width: 680px;
             margin: 0 auto; padding: 24px; color: #1a1a1a;">
  <div style="border-bottom: 2px solid #6366f1; padding-bottom: 16px;
              margin-bottom: 24px;">
    <h1 style="font-size: 22px; margin: 0;">{title}</h1>
    <p style="color: #6b7280; font-size: 13px; margin-top: 4px;">
      由 LyraNote 自动生成
    </p>
  </div>
  <div style="line-height: 1.7; font-size: 15px;">
    {body_html}
  </div>
  <div style="border-top: 1px solid #e5e7eb; margin-top: 32px;
              padding-top: 16px; color: #9ca3af; font-size: 12px;">
    此邮件由 LyraNote 定时任务自动发送。
  </div>
</body>
</html>"""
