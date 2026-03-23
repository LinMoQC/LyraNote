"""Markdown → email HTML conversion with modern, email-client-safe styling."""

import markdown
from datetime import datetime, timezone


def markdown_to_email_html(md_content: str, title: str = "") -> str:
    body_html = markdown.markdown(
        md_content, extensions=["extra", "codehilite", "tables", "toc"]
    )
    now = datetime.now(timezone.utc).strftime("%Y年%m月%d日")

    return f"""<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  <style>
    /* Reset */
    body, table, td, p, a, li, blockquote {{ margin: 0; padding: 0; }}
    body {{ -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }}
    table {{ border-collapse: collapse; mso-table-lspace: 0; mso-table-rspace: 0; }}
    img {{ border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }}

    /* Content styles (Gmail strips <style> in <head>, so we also apply inline) */
    .content h1 {{ font-size: 22px; font-weight: 700; color: #111827; margin: 28px 0 10px; line-height: 1.3; }}
    .content h2 {{ font-size: 18px; font-weight: 600; color: #1f2937; margin: 24px 0 8px; line-height: 1.4; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }}
    .content h3 {{ font-size: 15px; font-weight: 600; color: #374151; margin: 20px 0 6px; }}
    .content p  {{ margin: 0 0 14px; color: #374151; }}
    .content ul, .content ol {{ margin: 0 0 14px; padding-left: 22px; color: #374151; }}
    .content li {{ margin-bottom: 6px; line-height: 1.6; }}
    .content a  {{ color: #6366f1; text-decoration: none; }}
    .content a:hover {{ text-decoration: underline; }}
    .content blockquote {{ border-left: 3px solid #6366f1; margin: 14px 0; padding: 10px 16px; background: #f5f3ff; color: #4b5563; border-radius: 0 6px 6px 0; }}
    .content code {{ background: #f3f4f6; border-radius: 4px; padding: 1px 5px; font-family: 'SF Mono', Consolas, monospace; font-size: 13px; color: #6366f1; }}
    .content pre  {{ background: #1f2937; border-radius: 8px; padding: 16px; overflow-x: auto; margin: 0 0 14px; }}
    .content pre code {{ background: none; color: #e5e7eb; padding: 0; font-size: 13px; line-height: 1.6; }}
    .content table {{ width: 100%; border-collapse: collapse; margin: 0 0 14px; font-size: 14px; }}
    .content th {{ background: #f9fafb; border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; font-weight: 600; color: #374151; }}
    .content td {{ border: 1px solid #e5e7eb; padding: 8px 12px; color: #374151; }}
    .content tr:nth-child(even) td {{ background: #f9fafb; }}
    .content hr {{ border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }}
    .content strong {{ color: #111827; font-weight: 600; }}
  </style>
</head>
<body style="background-color: #f3f4f6; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">

  <!-- Outer wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 640px;">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border-radius: 12px 12px 0 0; padding: 28px 36px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="display: inline-block; background: rgba(255,255,255,0.15); border-radius: 6px; padding: 4px 10px; font-size: 12px; color: rgba(255,255,255,0.85); font-weight: 500; letter-spacing: 0.5px; text-transform: uppercase;">LyraNote</span>
                    <h1 style="margin: 12px 0 4px; font-size: 22px; font-weight: 700; color: #ffffff; line-height: 1.3;">{title}</h1>
                    <p style="margin: 0; font-size: 13px; color: rgba(255,255,255,0.7);">{now} · 由 LyraNote 自动生成</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background: #ffffff; padding: 32px 36px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.06);">
              <div class="content" style="font-size: 15px; line-height: 1.75; color: #374151;">
                {body_html}
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 36px; text-align: center;">
              <p style="font-size: 12px; color: #9ca3af; margin: 0; line-height: 1.6;">
                此邮件由 <a href="#" style="color: #6366f1; text-decoration: none;">LyraNote</a> 定时任务自动发送 · 如需取消请前往设置管理定时任务
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>"""
