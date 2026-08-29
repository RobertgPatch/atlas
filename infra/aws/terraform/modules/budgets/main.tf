locals {
  alert_email_configured = var.alert_email == null ? false : trimspace(var.alert_email) != ""
  alert_email            = local.alert_email_configured ? trimspace(var.alert_email) : null
}

resource "aws_budgets_budget" "monthly" {
  name         = "${var.name_prefix}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_limit_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_types {
    include_credit             = true
    include_discount           = true
    include_other_subscription = true
    include_recurring          = true
    include_refund             = true
    include_subscription       = true
    include_support            = true
    include_tax                = true
    include_upfront            = true
    use_amortized              = false
    use_blended                = false
  }

  dynamic "notification" {
    for_each = local.alert_email_configured ? var.notification_thresholds : []

    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = "ACTUAL"
      subscriber_email_addresses = [local.alert_email]
    }
  }

  dynamic "notification" {
    for_each = local.alert_email_configured ? var.forecast_notification_thresholds : []

    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = "FORECASTED"
      subscriber_email_addresses = [local.alert_email]
    }
  }

  lifecycle {
    precondition {
      condition = var.environment_name != "production" || (
        var.monthly_limit_usd == 125 &&
        local.alert_email_configured &&
        var.budget_destination_confirmed
      )
      error_message = "Production requires an exact $125 notification-only Budget, a non-empty alert_email, and budget_destination_confirmed=true."
    }
  }
}

resource "aws_budgets_budget" "k1_bedrock" {
  name         = "${var.name_prefix}-k1-bedrock"
  budget_type  = "COST"
  limit_amount = tostring(var.bedrock_monthly_limit_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "Service"
    values = ["Amazon Bedrock"]
  }

  dynamic "notification" {
    for_each = local.alert_email_configured ? var.bedrock_notification_thresholds : []

    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = "ACTUAL"
      subscriber_email_addresses = [local.alert_email]
    }
  }

  dynamic "notification" {
    for_each = local.alert_email_configured ? var.bedrock_forecast_notification_thresholds : []

    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = "FORECASTED"
      subscriber_email_addresses = [local.alert_email]
    }
  }
}

resource "aws_ce_anomaly_monitor" "services" {
  name              = "${var.name_prefix}-aws-services"
  monitor_type      = "DIMENSIONAL"
  monitor_dimension = "SERVICE"
}

resource "aws_ce_anomaly_subscription" "services" {
  count = local.alert_email_configured ? 1 : 0

  name             = "${var.name_prefix}-aws-service-anomalies"
  frequency        = "DAILY"
  monitor_arn_list = [aws_ce_anomaly_monitor.services.arn]

  subscriber {
    type    = "EMAIL"
    address = local.alert_email
  }

  threshold_expression {
    dimension {
      key           = "ANOMALY_TOTAL_IMPACT_ABSOLUTE"
      match_options = ["GREATER_THAN_OR_EQUAL"]
      values        = [tostring(var.cost_anomaly_threshold_usd)]
    }
  }
}
