"""
Unit tests for scheduled task delivery summaries.
"""

from app.workers.tasks.scheduler import summarize_delivery_outcome


def test_summarize_delivery_outcome_reports_email_failure_reason():
    summary, issues = summarize_delivery_outcome(
        {
            "email": "failed",
            "email_error": "SMTP not configured: missing host or username",
        }
    )

    assert summary == "邮件发送失败"
    assert issues == "邮件投递失败：SMTP not configured: missing host or username"


def test_summarize_delivery_outcome_reports_combined_success():
    summary, issues = summarize_delivery_outcome(
        {
            "email": "sent",
            "note": "created",
        }
    )

    assert summary == "邮件已发送，已写入笔记"
    assert issues is None


def test_summarize_delivery_outcome_reports_multiple_issues():
    summary, issues = summarize_delivery_outcome(
        {
            "email": "skipped_no_address",
            "note": "skipped_no_notebook",
        }
    )

    assert summary == "缺少收件邮箱，未找到笔记本"
    assert issues == "邮件投递失败：未配置收件邮箱；笔记投递失败：未找到可写入的系统笔记本"
