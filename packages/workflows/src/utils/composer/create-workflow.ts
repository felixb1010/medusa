import { WorkflowHandler, WorkflowManager } from "@medusajs/orchestration"
import { exportWorkflow, FlowRunOptions, WorkflowResult } from "../../helper"
import { CreateWorkflowComposerContext, StepReturn } from "./index"
import {
  SymbolInputReference,
  SymbolMedusaWorkflowComposerContext,
  SymbolWorkflowStep,
} from "./symbol"

global[SymbolMedusaWorkflowComposerContext] = null

export function createWorkflow<TData extends unknown, TResult extends unknown>(
  name: string,
  composer: (input: StepReturn<TData>) => StepReturn<TResult>
) {
  const handlers: WorkflowHandler = new Map()

  if (WorkflowManager.getWorkflow(name)) {
    WorkflowManager.unregister(name)
  }

  WorkflowManager.register(name, undefined, handlers)

  const context: CreateWorkflowComposerContext = {
    workflowId: name,
    flow: WorkflowManager.getTransactionDefinition(name),
    handlers,
    stepBinder: (fn) => {
      return fn.bind(context)()
    },
    parallelizeBinder: (fn) => {
      return fn.bind(context)()
    },
  }

  global[SymbolMedusaWorkflowComposerContext] = context

  const valueHolder: StepReturn = {
    __value: {},
    __type: SymbolInputReference,
    __step__: "",
  }

  const returnedStep = composer.apply(context, [valueHolder])

  delete global[SymbolMedusaWorkflowComposerContext]

  WorkflowManager.update(name, context.flow, handlers)

  const workflow = exportWorkflow<TData, TResult>(name)

  return <TDataOverride = undefined, TResultOverride = undefined>(...args) => {
    const workflow_ = workflow<TDataOverride, TResultOverride>(...args)
    const originalRun = workflow_.run

    workflow_.run = (async (
      args?: FlowRunOptions<
        TDataOverride extends undefined ? TData : TDataOverride
      >
    ): Promise<WorkflowResult<TResult>> => {
      args ??= {}
      args.resultFrom ??=
        returnedStep?.__type === SymbolWorkflowStep
          ? returnedStep.__step__
          : undefined

      // Forwards the input to the ref object on composer.apply
      valueHolder.__value = args?.input as any
      return (await originalRun(args)) as unknown as WorkflowResult<TResult>
    }) as any
    return workflow_
  }
}