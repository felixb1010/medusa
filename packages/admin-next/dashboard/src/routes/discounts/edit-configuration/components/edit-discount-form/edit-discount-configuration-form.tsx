import { useMemo } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Trans, useTranslation } from "react-i18next"
import { parse, Duration } from "iso8601-duration"
import { formatISODuration } from "date-fns"
import * as zod from "zod"

import { Discount } from "@medusajs/medusa"
import { Button, Input, Text, Switch, DatePicker } from "@medusajs/ui"
import { useAdminUpdateDiscount } from "medusa-react"

import { Form } from "../../../../../components/common/form"
import {
  RouteDrawer,
  useRouteModal,
} from "../../../../../components/route-modal"
import { pick } from "../../../../../lib/common"

type EditDiscountFormProps = {
  discount: Discount
}

const EditDiscountSchema = zod.object({
  start_date_enabled: zod.boolean(),
  start_date: zod.date(),

  end_date_enabled: zod.boolean(),
  end_date: zod.date().nullish(),

  enable_usage_limit: zod.boolean(),
  usage_limit: zod.number().nullish(),

  enable_duration: zod.boolean(),

  years: zod.number().optional(),
  months: zod.number().optional(),
  days: zod.number().optional(),
  hours: zod.number().optional(),
  minutes: zod.number().optional(),
})

export const EditDiscountConfigurationForm = ({
  discount,
}: EditDiscountFormProps) => {
  const { t } = useTranslation()
  const { handleSuccess } = useRouteModal()

  const duration = useMemo(
    () =>
      discount.valid_duration
        ? parse(discount.valid_duration)
        : ({ years: 0, months: 0, days: 0, hours: 0, minutes: 0 } as Duration),
    [discount]
  )

  const form = useForm<zod.infer<typeof EditDiscountSchema>>({
    defaultValues: {
      start_date_enabled: !!discount.starts_at,
      start_date: new Date(discount.starts_at),

      enable_usage_limit: !!discount.usage_limit,
      usage_limit: discount.usage_limit,

      enable_duration: !!discount.valid_duration,

      end_date_enabled: !!discount.ends_at,
      end_date: discount.ends_at ? new Date(discount.ends_at) : null,

      years: duration.years,
      months: duration.months,
      days: duration.days,
      hours: duration.hours,
      minutes: duration.minutes,
    },
    resolver: zodResolver(EditDiscountSchema),
  })

  const { mutateAsync, isLoading } = useAdminUpdateDiscount(discount.id)

  const handleSubmit = form.handleSubmit(async (data) => {
    await mutateAsync(
      {
        starts_at: data.start_date,
        ends_at: data.end_date_enabled ? data.end_date : null,
        usage_limit: data.enable_usage_limit ? data.usage_limit : null,
        valid_duration: data.enable_duration
          ? formatISODuration(
              pick(data, ["years", "months", "days", "hours", "minutes"])
            )
          : null,
      },
      {
        onSuccess: () => {
          handleSuccess()
        },
      }
    )
  })

  return (
    <RouteDrawer.Form form={form}>
      <form onSubmit={handleSubmit} className="flex h-full flex-col">
        <RouteDrawer.Body>
          <div className="flex h-full flex-col gap-y-8">
            <div className="flex flex-col gap-y-4">
              <Text
                size="small"
                leading="compact"
                className="text-ui-fg-subtle"
              >
                <Trans
                  t={t}
                  i18nKey="discounts.codeHint"
                  components={[<br key="break" />]}
                />
              </Text>
            </div>

            <div className="flex flex-col gap-y-4">
              <Form.Field
                control={form.control}
                name="start_date_enabled"
                render={() => (
                  <Form.Item>
                    <div className="flex items-center justify-between">
                      <Form.Label tooltip="todo">
                        {t("discounts.hasStartDate")}
                      </Form.Label>
                    </div>
                    <Form.Hint className="!mt-1">
                      {t("discounts.startDateHint")}
                    </Form.Hint>
                    <Form.ErrorMessage />
                  </Form.Item>
                )}
              />
              <Form.Field
                control={form.control}
                name="start_date"
                render={({
                  field: { value, onChange, ref: _ref, ...field },
                }) => {
                  return (
                    <Form.Item>
                      <div className="flex items-center justify-between">
                        <Form.Control>
                          <DatePicker
                            showTimePicker
                            value={value ?? undefined}
                            onChange={(v) => {
                              onChange(v ?? null)
                            }}
                            {...field}
                          />
                        </Form.Control>
                      </div>
                      <Form.ErrorMessage />
                    </Form.Item>
                  )
                }}
              />
            </div>

            <div className="flex flex-col gap-y-4">
              <Form.Field
                control={form.control}
                name="end_date_enabled"
                render={({ field: { value, onChange, ...field } }) => {
                  return (
                    <Form.Item>
                      <div className="flex items-center justify-between">
                        <Form.Label tooltip="todo">
                          {t("discounts.hasEndDate")}
                        </Form.Label>
                        <Form.Control>
                          <Switch
                            {...field}
                            checked={value}
                            onCheckedChange={onChange}
                          />
                        </Form.Control>
                      </div>
                      <Form.Hint className="!mt-1">
                        {t("discounts.endDateHint")}
                      </Form.Hint>
                      <Form.ErrorMessage />
                    </Form.Item>
                  )
                }}
              />
              <Form.Field
                control={form.control}
                name="end_date"
                render={({
                  field: { value, onChange, ref: _ref, ...field },
                }) => {
                  return (
                    <Form.Item>
                      <div className="flex items-center justify-between">
                        <Form.Control>
                          <DatePicker
                            showTimePicker
                            value={value ?? undefined}
                            onChange={(v) => {
                              onChange(v ?? null)
                            }}
                            {...field}
                            /**
                             * TODO: FIX bug in the picker when a placeholder is provided it resets selected value to undefined
                             */
                            // placeholder="DD/MM/YYYY HH:MM"
                            /*
                             * Disable input here. If set on Field it wont properly set the value.
                             */
                            disabled={!form.watch("end_date_enabled")}
                          />
                        </Form.Control>
                      </div>

                      <Form.ErrorMessage />
                    </Form.Item>
                  )
                }}
              />
            </div>

            <div className="flex flex-col gap-y-4">
              <Form.Field
                control={form.control}
                name="enable_usage_limit"
                render={({ field }) => {
                  return (
                    <Form.Item>
                      <div className="flex items-center justify-between">
                        <Form.Label tooltip="todo">
                          {t("discounts.hasUsageLimit")}
                        </Form.Label>
                        <Form.Control>
                          <Form.Control>
                            <Switch
                              checked={!!field.value}
                              onCheckedChange={field.onChange}
                            />
                          </Form.Control>
                        </Form.Control>
                      </div>
                      <Form.Hint className="!mt-1">
                        {t("discounts.usageLimitHint")}
                      </Form.Hint>
                      <Form.ErrorMessage />
                    </Form.Item>
                  )
                }}
              />

              <Form.Field
                control={form.control}
                name="usage_limit"
                render={({ field }) => {
                  return (
                    <Form.Item>
                      <Form.Control>
                        <Input
                          {...field}
                          type="number"
                          min={0}
                          disabled={!form.watch("enable_usage_limit")}
                          onChange={(e) => {
                            const value = e.target.value

                            if (value === "") {
                              field.onChange(null)
                            } else {
                              field.onChange(Number(value))
                            }
                          }}
                        />
                      </Form.Control>
                      <Form.ErrorMessage />
                    </Form.Item>
                  )
                }}
              />
            </div>

            <div className="flex flex-col gap-y-4">
              <Form.Field
                control={form.control}
                name="enable_duration"
                render={({ field }) => {
                  return (
                    <Form.Item>
                      <div className="flex items-center justify-between">
                        <Form.Label tooltip="todo">
                          {t("discounts.hasDurationLimit")}
                        </Form.Label>
                        <Form.Control>
                          <Form.Control>
                            <Switch
                              checked={!!field.value}
                              onCheckedChange={field.onChange}
                            />
                          </Form.Control>
                        </Form.Control>
                      </div>
                      <Form.Hint className="!mt-1">
                        {t("discounts.durationHint")}
                      </Form.Hint>
                      <Form.ErrorMessage />
                    </Form.Item>
                  )
                }}
              />
              <div className="flex items-center justify-between gap-3">
                <Form.Field
                  control={form.control}
                  name="years"
                  render={({ field }) => {
                    return (
                      <Form.Item className="flex-1">
                        <Form.Label>{t("fields.years")}</Form.Label>
                        <Form.Control>
                          <Input
                            {...field}
                            type="number"
                            min={0}
                            disabled={!form.watch("enable_duration")}
                            onChange={(e) => {
                              const value = e.target.value

                              if (value === "") {
                                field.onChange(null)
                              } else {
                                field.onChange(Number(value))
                              }
                            }}
                          />
                        </Form.Control>
                        <Form.ErrorMessage />
                      </Form.Item>
                    )
                  }}
                />
                <Form.Field
                  control={form.control}
                  name="months"
                  render={({ field }) => {
                    return (
                      <Form.Item className="flex-1">
                        <Form.Label>{t("fields.months")}</Form.Label>
                        <Form.Control>
                          <Input
                            {...field}
                            type="number"
                            min={0}
                            disabled={!form.watch("enable_duration")}
                            onChange={(e) => {
                              const value = e.target.value

                              if (value === "") {
                                field.onChange(null)
                              } else {
                                field.onChange(Number(value))
                              }
                            }}
                          />
                        </Form.Control>
                        <Form.ErrorMessage />
                      </Form.Item>
                    )
                  }}
                />
                <Form.Field
                  control={form.control}
                  name="days"
                  render={({ field }) => {
                    return (
                      <Form.Item className="flex-1">
                        <Form.Label>{t("fields.days")}</Form.Label>
                        <Form.Control>
                          <Input
                            {...field}
                            type="number"
                            min={0}
                            disabled={!form.watch("enable_duration")}
                            onChange={(e) => {
                              const value = e.target.value

                              if (value === "") {
                                field.onChange(null)
                              } else {
                                field.onChange(Number(value))
                              }
                            }}
                          />
                        </Form.Control>
                        <Form.ErrorMessage />
                      </Form.Item>
                    )
                  }}
                />
              </div>
              <div className="flex items-center gap-3">
                <Form.Field
                  control={form.control}
                  name="hours"
                  render={({ field }) => {
                    return (
                      <Form.Item className="flex-1">
                        <Form.Label>{t("fields.hours")}</Form.Label>
                        <Form.Control>
                          <Input
                            {...field}
                            type="number"
                            min={0}
                            disabled={!form.watch("enable_duration")}
                            onChange={(e) => {
                              const value = e.target.value

                              if (value === "") {
                                field.onChange(null)
                              } else {
                                field.onChange(Number(value))
                              }
                            }}
                          />
                        </Form.Control>
                        <Form.ErrorMessage />
                      </Form.Item>
                    )
                  }}
                />
                <Form.Field
                  control={form.control}
                  name="minutes"
                  render={({ field }) => {
                    return (
                      <Form.Item className="flex-1">
                        <Form.Label>{t("fields.minutes")}</Form.Label>
                        <Form.Control>
                          <Input
                            {...field}
                            type="number"
                            min={0}
                            disabled={!form.watch("enable_duration")}
                            onChange={(e) => {
                              const value = e.target.value
                              if (value === "") {
                                field.onChange(null)
                              } else {
                                console.log(Number(value))
                                field.onChange(Number(value))
                              }
                            }}
                          />
                        </Form.Control>
                        <Form.ErrorMessage />
                      </Form.Item>
                    )
                  }}
                />
              </div>
            </div>
          </div>
        </RouteDrawer.Body>
        <RouteDrawer.Footer>
          <div className="flex items-center justify-end gap-x-2">
            <RouteDrawer.Close asChild>
              <Button size="small" variant="secondary">
                {t("actions.cancel")}
              </Button>
            </RouteDrawer.Close>
            <Button size="small" type="submit" isLoading={isLoading}>
              {t("actions.save")}
            </Button>
          </div>
        </RouteDrawer.Footer>
      </form>
    </RouteDrawer.Form>
  )
}
