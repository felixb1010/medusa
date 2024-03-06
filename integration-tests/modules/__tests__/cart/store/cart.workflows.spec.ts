import {
  addToCartWorkflow,
  createCartWorkflow,
  createPaymentCollectionForCartWorkflow,
  deleteLineItemsStepId,
  deleteLineItemsWorkflow,
  findOrCreateCustomerStepId,
  linkCartAndPaymentCollectionsStepId,
  updateLineItemInCartWorkflow,
  updateLineItemsStepId,
} from "@medusajs/core-flows"
import { ModuleRegistrationName } from "@medusajs/modules-sdk"
import {
  ICartModuleService,
  ICustomerModuleService,
  IPaymentModuleService,
  IPricingModuleService,
  IProductModuleService,
  IRegionModuleService,
  ISalesChannelModuleService,
} from "@medusajs/types"
import adminSeeder from "../../../../helpers/admin-seeder"
import { medusaIntegrationTestRunner } from "medusa-test-utils"

jest.setTimeout(200000)

const env = { MEDUSA_FF_MEDUSA_V2: true }

medusaIntegrationTestRunner({
  env,
  testSuite: ({ dbConnection, getContainer, api }) => {
    describe("Carts workflows", () => {
      let appContainer
      let cartModuleService: ICartModuleService
      let regionModuleService: IRegionModuleService
      let scModuleService: ISalesChannelModuleService
      let customerModule: ICustomerModuleService
      let productModule: IProductModuleService
      let pricingModule: IPricingModuleService
      let paymentModule: IPaymentModuleService
      let remoteLink, remoteQuery

      let defaultRegion

      beforeAll(async () => {
        appContainer = getContainer()
        cartModuleService = appContainer.resolve(ModuleRegistrationName.CART)
        regionModuleService = appContainer.resolve(
          ModuleRegistrationName.REGION
        )
        scModuleService = appContainer.resolve(
          ModuleRegistrationName.SALES_CHANNEL
        )
        customerModule = appContainer.resolve(ModuleRegistrationName.CUSTOMER)
        productModule = appContainer.resolve(ModuleRegistrationName.PRODUCT)
        pricingModule = appContainer.resolve(ModuleRegistrationName.PRICING)
        paymentModule = appContainer.resolve(ModuleRegistrationName.PAYMENT)
        remoteLink = appContainer.resolve("remoteLink")
        remoteQuery = appContainer.resolve("remoteQuery")
      })

      beforeEach(async () => {
        await adminSeeder(dbConnection)

        // Here, so we don't have to create a region for each test
        defaultRegion = await regionModuleService.create({
          name: "Default Region",
          currency_code: "dkk",
        })
      })

      describe("CreateCartWorkflow", () => {
        it("should create a cart", async () => {
          const region = await regionModuleService.create({
            name: "US",
            currency_code: "usd",
          })

          const salesChannel = await scModuleService.create({
            name: "Webshop",
          })

          const [product] = await productModule.create([
            {
              title: "Test product",
              variants: [
                {
                  title: "Test variant",
                },
              ],
            },
          ])

          const priceSet = await pricingModule.create({
            prices: [
              {
                amount: 3000,
                currency_code: "usd",
              },
            ],
          })

          await remoteLink.create([
            {
              productService: {
                variant_id: product.variants[0].id,
              },
              pricingService: {
                price_set_id: priceSet.id,
              },
            },
          ])

          const { result } = await createCartWorkflow(appContainer).run({
            input: {
              email: "tony@stark.com",
              currency_code: "usd",
              region_id: region.id,
              sales_channel_id: salesChannel.id,
              items: [
                {
                  variant_id: product.variants[0].id,
                  quantity: 1,
                },
              ],
            },
          })

          const cart = await cartModuleService.retrieve(result.id, {
            relations: ["items"],
          })

          expect(cart).toEqual(
            expect.objectContaining({
              currency_code: "usd",
              email: "tony@stark.com",
              region_id: region.id,
              sales_channel_id: salesChannel.id,
              customer_id: expect.any(String),
              items: expect.arrayContaining([
                expect.objectContaining({
                  quantity: 1,
                  unit_price: 3000,
                }),
              ]),
            })
          )
        })

        it("should throw when no regions exist", async () => {
          await regionModuleService.delete(defaultRegion.id)

          const { errors } = await createCartWorkflow(appContainer).run({
            input: {
              email: "tony@stark.com",
              currency_code: "usd",
            },
            throwOnError: false,
          })

          expect(errors).toEqual([
            {
              action: "find-one-or-any-region",
              handlerType: "invoke",
              error: new Error("No regions found"),
            },
          ])
        })

        it("should throw if sales channel is disabled", async () => {
          const salesChannel = await scModuleService.create({
            name: "Webshop",
            is_disabled: true,
          })

          const { errors } = await createCartWorkflow(appContainer).run({
            input: {
              sales_channel_id: salesChannel.id,
            },
            throwOnError: false,
          })

          expect(errors).toEqual([
            {
              action: "find-sales-channel",
              handlerType: "invoke",
              error: new Error(
                `Unable to assign cart to disabled Sales Channel: Webshop`
              ),
            },
          ])
        })

        describe("compensation", () => {
          it("should delete created customer if cart-creation fails", async () => {
            expect.assertions(2)
            const workflow = createCartWorkflow(appContainer)

            workflow.appendAction("throw", findOrCreateCustomerStepId, {
              invoke: async function failStep() {
                throw new Error(`Failed to create cart`)
              },
            })

            const { errors } = await workflow.run({
              input: {
                currency_code: "usd",
                email: "tony@stark-industries.com",
              },
              throwOnError: false,
            })

            expect(errors).toEqual([
              {
                action: "throw",
                handlerType: "invoke",
                error: new Error(`Failed to create cart`),
              },
            ])

            const customers = await customerModule.list({
              email: "tony@stark-industries.com",
            })

            expect(customers).toHaveLength(0)
          })

          it("should not delete existing customer if cart-creation fails", async () => {
            expect.assertions(2)
            const workflow = createCartWorkflow(appContainer)

            workflow.appendAction("throw", findOrCreateCustomerStepId, {
              invoke: async function failStep() {
                throw new Error(`Failed to create cart`)
              },
            })

            const customer = await customerModule.create({
              email: "tony@stark-industries.com",
            })

            const { errors } = await workflow.run({
              input: {
                currency_code: "usd",
                customer_id: customer.id,
              },
              throwOnError: false,
            })

            expect(errors).toEqual([
              {
                action: "throw",
                handlerType: "invoke",
                error: new Error(`Failed to create cart`),
              },
            ])

            const customers = await customerModule.list({
              email: "tony@stark-industries.com",
            })

            expect(customers).toHaveLength(1)
          })
        })
      })

      describe("AddToCartWorkflow", () => {
        it("should add item to cart", async () => {
          let cart = await cartModuleService.create({
            currency_code: "usd",
          })

          const [product] = await productModule.create([
            {
              title: "Test product",
              variants: [
                {
                  title: "Test variant",
                },
              ],
            },
          ])

          const priceSet = await pricingModule.create({
            prices: [
              {
                amount: 3000,
                currency_code: "usd",
              },
            ],
          })

          await remoteLink.create([
            {
              productService: {
                variant_id: product.variants[0].id,
              },
              pricingService: {
                price_set_id: priceSet.id,
              },
            },
          ])

          cart = await cartModuleService.retrieve(cart.id, {
            select: ["id", "region_id", "currency_code"],
          })

          await addToCartWorkflow(appContainer).run({
            input: {
              items: [
                {
                  variant_id: product.variants[0].id,
                  quantity: 1,
                },
              ],
              cart,
            },
          })

          cart = await cartModuleService.retrieve(cart.id, {
            relations: ["items"],
          })

          expect(cart).toEqual(
            expect.objectContaining({
              id: cart.id,
              currency_code: "usd",
              items: expect.arrayContaining([
                expect.objectContaining({
                  unit_price: 3000,
                  quantity: 1,
                  title: "Test variant",
                }),
              ]),
            })
          )
        })

        it("should throw if no price sets for variant exist", async () => {
          const cart = await cartModuleService.create({
            currency_code: "usd",
          })

          const [product] = await productModule.create([
            {
              title: "Test product",
              variants: [
                {
                  title: "Test variant",
                },
              ],
            },
          ])

          const { errors } = await addToCartWorkflow(appContainer).run({
            input: {
              items: [
                {
                  variant_id: product.variants[0].id,
                  quantity: 1,
                },
              ],
              cart,
            },
            throwOnError: false,
          })

          expect(errors).toEqual([
            {
              action: "get-variant-price-sets",
              handlerType: "invoke",
              error: new Error(
                `Variants with IDs ${product.variants[0].id} do not have a price`
              ),
            },
          ])
        })

        it("should throw if variant does not exist", async () => {
          const cart = await cartModuleService.create({
            currency_code: "usd",
          })

          const { errors } = await addToCartWorkflow(appContainer).run({
            input: {
              items: [
                {
                  variant_id: "prva_foo",
                  quantity: 1,
                },
              ],
              cart,
            },
            throwOnError: false,
          })

          expect(errors).toEqual([
            {
              action: "validate-variants-exist",
              handlerType: "invoke",
              error: new Error(`Variants with IDs prva_foo do not exist`),
            },
          ])
        })
      })

      describe("updateLineItemInCartWorkflow", () => {
        it("should update item in cart", async () => {
          const [product] = await productModule.create([
            {
              title: "Test product",
              variants: [
                {
                  title: "Test variant",
                },
              ],
            },
          ])

          const priceSet = await pricingModule.create({
            prices: [
              {
                amount: 3000,
                currency_code: "usd",
              },
            ],
          })

          await remoteLink.create([
            {
              productService: {
                variant_id: product.variants[0].id,
              },
              pricingService: {
                price_set_id: priceSet.id,
              },
            },
          ])

          let cart = await cartModuleService.create({
            currency_code: "usd",
            items: [
              {
                variant_id: product.variants[0].id,
                quantity: 1,
                unit_price: 5000,
                title: "Test item",
              },
            ],
          })

          cart = await cartModuleService.retrieve(cart.id, {
            select: ["id", "region_id", "currency_code"],
            relations: ["items", "items.variant_id", "items.metadata"],
          })

          const item = cart.items?.[0]!

          await updateLineItemInCartWorkflow(appContainer).run({
            input: {
              cart,
              item,
              update: {
                metadata: {
                  foo: "bar",
                },
                quantity: 2,
              },
            },
            throwOnError: false,
          })

          const updatedItem = await cartModuleService.retrieveLineItem(item.id)

          expect(updatedItem).toEqual(
            expect.objectContaining({
              id: item.id,
              unit_price: 3000,
              quantity: 2,
              title: "Test item",
            })
          )
        })

        describe("compensation", () => {
          it("should revert line item update to original state", async () => {
            expect.assertions(2)
            const workflow = updateLineItemInCartWorkflow(appContainer)

            workflow.appendAction("throw", updateLineItemsStepId, {
              invoke: async function failStep() {
                throw new Error(`Failed to update something after line items`)
              },
            })

            const [product] = await productModule.create([
              {
                title: "Test product",
                variants: [
                  {
                    title: "Test variant",
                  },
                ],
              },
            ])

            let cart = await cartModuleService.create({
              currency_code: "usd",
              items: [
                {
                  variant_id: product.variants[0].id,
                  quantity: 1,
                  unit_price: 3000,
                  title: "Test item",
                },
              ],
            })

            const priceSet = await pricingModule.create({
              prices: [
                {
                  amount: 5000,
                  currency_code: "usd",
                },
              ],
            })

            await remoteLink.create([
              {
                productService: {
                  variant_id: product.variants[0].id,
                },
                pricingService: {
                  price_set_id: priceSet.id,
                },
              },
            ])

            cart = await cartModuleService.retrieve(cart.id, {
              select: ["id", "region_id", "currency_code"],
              relations: ["items", "items.variant_id", "items.metadata"],
            })

            const item = cart.items?.[0]!

            const { errors } = await workflow.run({
              input: {
                cart,
                item,
                update: {
                  metadata: {
                    foo: "bar",
                  },
                  title: "Test item updated",
                  quantity: 2,
                },
              },
              throwOnError: false,
            })

            expect(errors).toEqual([
              {
                action: "throw",
                handlerType: "invoke",
                error: new Error(`Failed to update something after line items`),
              },
            ])

            const updatedItem = await cartModuleService.retrieveLineItem(
              item.id
            )

            expect(updatedItem).toEqual(
              expect.objectContaining({
                id: item.id,
                unit_price: 3000,
                quantity: 1,
                title: "Test item",
              })
            )
          })
        })
      })

      describe("deleteLineItems", () => {
        it("should delete items in cart", async () => {
          const cart = await cartModuleService.create({
            currency_code: "usd",
            items: [
              {
                quantity: 1,
                unit_price: 5000,
                title: "Test item",
              },
            ],
          })

          const items = await cartModuleService.listLineItems({
            cart_id: cart.id,
          })

          await deleteLineItemsWorkflow(appContainer).run({
            input: {
              ids: items.map((i) => i.id),
            },
            throwOnError: false,
          })

          const [deletedItem] = await cartModuleService.listLineItems({
            id: items.map((i) => i.id),
          })

          expect(deletedItem).toBeUndefined()
        })

        describe("compensation", () => {
          it("should restore line item if delete fails", async () => {
            const workflow = deleteLineItemsWorkflow(appContainer)

            workflow.appendAction("throw", deleteLineItemsStepId, {
              invoke: async function failStep() {
                throw new Error(
                  `Failed to do something after deleting line items`
                )
              },
            })

            const cart = await cartModuleService.create({
              currency_code: "usd",
              items: [
                {
                  quantity: 1,
                  unit_price: 3000,
                  title: "Test item",
                },
              ],
            })

            const items = await cartModuleService.listLineItems({
              cart_id: cart.id,
            })

            const { errors } = await workflow.run({
              input: {
                ids: items.map((i) => i.id),
              },
              throwOnError: false,
            })

            expect(errors).toEqual([
              {
                action: "throw",
                handlerType: "invoke",
                error: new Error(
                  `Failed to do something after deleting line items`
                ),
              },
            ])

            const updatedItem = await cartModuleService.retrieveLineItem(
              items[0].id
            )

            expect(updatedItem).not.toBeUndefined()
          })
        })
      })

      describe("createPaymentCollectionForCart", () => {
        it("should create a payment collection and link it to cart", async () => {
          const region = await regionModuleService.create({
            name: "US",
            currency_code: "usd",
          })

          const cart = await cartModuleService.create({
            currency_code: "usd",
            region_id: region.id,
            items: [
              {
                quantity: 1,
                unit_price: 5000,
                title: "Test item",
              },
            ],
          })

          await createPaymentCollectionForCartWorkflow(appContainer).run({
            input: {
              cart_id: cart.id,
              region_id: region.id,
              currency_code: "usd",
              amount: 5000,
            },
            throwOnError: false,
          })

          const result = await remoteQuery(
            {
              cart: {
                fields: ["id"],
                payment_collection: {
                  fields: ["id", "amount", "currency_code"],
                },
              },
            },
            {
              cart: {
                id: cart.id,
              },
            }
          )

          expect(result).toEqual([
            expect.objectContaining({
              id: cart.id,
              payment_collection: expect.objectContaining({
                amount: 5000,
                currency_code: "usd",
              }),
            }),
          ])
        })

        describe("compensation", () => {
          it("should dismiss cart <> payment collection link and delete created payment collection", async () => {
            const workflow =
              createPaymentCollectionForCartWorkflow(appContainer)

            workflow.appendAction(
              "throw",
              linkCartAndPaymentCollectionsStepId,
              {
                invoke: async function failStep() {
                  throw new Error(
                    `Failed to do something after linking cart and payment collection`
                  )
                },
              }
            )

            const region = await regionModuleService.create({
              name: "US",
              currency_code: "usd",
            })

            const cart = await cartModuleService.create({
              currency_code: "usd",
              region_id: region.id,
              items: [
                {
                  quantity: 1,
                  unit_price: 5000,
                  title: "Test item",
                },
              ],
            })

            const { errors } = await workflow.run({
              input: {
                cart_id: cart.id,
                region_id: region.id,
                currency_code: "usd",
                amount: 5000,
              },
              throwOnError: false,
            })

            expect(errors).toEqual([
              {
                action: "throw",
                handlerType: "invoke",
                error: new Error(
                  `Failed to do something after linking cart and payment collection`
                ),
              },
            ])

            const carts = await remoteQuery(
              {
                cart: {
                  fields: ["id"],
                  payment_collection: {
                    fields: ["id", "amount", "currency_code"],
                  },
                },
              },
              {
                cart: {
                  id: cart.id,
                },
              }
            )

            const payCols = await remoteQuery({
              payment_collection: {
                fields: ["id"],
              },
            })

            expect(carts).toEqual([
              expect.objectContaining({
                id: cart.id,
                payment_collection: undefined,
              }),
            ])
            expect(payCols.length).toEqual(0)
          })
        })
      })
    })
  },
})
