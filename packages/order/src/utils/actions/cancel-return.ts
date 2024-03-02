import { MedusaError, isDefined } from "@medusajs/utils"
import { ChangeActionType } from "../action-key"
import { OrderChangeProcessing } from "../calculate-order-change"

OrderChangeProcessing.registerActionType(ChangeActionType.CANCEL_RETURN, {
  operation({ action, currentOrder }) {
    const existing = currentOrder.items.find(
      (item) => item.id === action.details.reference_id
    )!

    existing.detail.return_requested_quantity ??= 0

    existing.detail.return_requested_quantity -= action.details.quantity

    return action.details.unit_price * action.details.quantity
  },
  revert({ action, currentOrder }) {
    const existing = currentOrder.items.find(
      (item) => item.id === action.details.reference_id
    )!

    existing.detail.return_requested_quantity += action.details.quantity
  },
  validate({ action, currentOrder }) {
    const refId = action.details?.reference_id
    if (!isDefined(refId)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Details reference ID is required."
      )
    }

    if (!isDefined(action.amount) && !isDefined(action.details.unit_price)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Unit price of item ${action.reference_id} is required if no action.amount is provided.`
      )
    }

    const existing = currentOrder.items.find((item) => item.id === refId)

    if (!existing) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Reference ID "${refId}" not found.`
      )
    }

    if (!action.details.quantity) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Quantity to cancel return of item ${refId} is required.`
      )
    }

    if (action.details.quantity > existing.detail.return_requested_quantity) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Cannot cancel more items than what was requested to return for item ${refId}.`
      )
    }
  },
})
