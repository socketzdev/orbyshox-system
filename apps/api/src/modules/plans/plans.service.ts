import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createPlanSchema, createCouponSchema } from '@projeto-saas/shared-types';

@Injectable()
export class PlansService {
  constructor(@Inject('PRISMA') private prisma: PrismaClient) {}

  async findAllPlans() {
    return this.prisma.plan.findMany({
      where: { isArchived: false },
      include: { _count: { select: { features: true, subscriptions: true } } },
      orderBy: { price: 'asc' },
    });
  }

  async findOne(id: string) {
    const plan = await this.prisma.plan.findUnique({
      where: { id },
      include: { features: true, _count: { select: { subscriptions: true } } },
    });
    if (!plan) throw new NotFoundException(`Plan ${id} not found`);
    return plan;
  }

  async createPlan(payload: any) {
    const parsed = createPlanSchema.safeParse(payload);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const data = parsed.data;
    return this.prisma.plan.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        price: data.price,
        billingPeriod: data.billingPeriod,
        maxUsers: data.maxUsers,
        maxUnits: data.maxUnits,
        isVisible: data.isVisible,
        features: {
          create:
            data.features?.map((f) => ({
              featureKey: f.featureKey,
              featureLabel: f.featureLabel,
              enabled: f.enabled,
            })) ?? [],
        },
      },
      include: { features: true },
    });
  }

  async updatePlan(id: string, payload: any) {
    const parsed = createPlanSchema.partial().safeParse(payload);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const { features, ...planData } = parsed.data;
    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.plan.update({ where: { id }, data: planData });
      if (features) {
        await tx.planFeature.deleteMany({ where: { planId: id } });
        await tx.planFeature.createMany({
          data: features.map((f) => ({
            planId: id,
            featureKey: f.featureKey,
            featureLabel: f.featureLabel,
            enabled: f.enabled,
          })),
        });
      }
      return plan;
    });
  }

  async archivePlan(id: string) {
    return this.prisma.plan.update({ where: { id }, data: { isArchived: true } });
  }

  async findAllCoupons(query: any) {
    return this.prisma.coupon.findMany({
      include: { _count: { select: { usages: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createCoupon(payload: any) {
    const parsed = createCouponSchema.safeParse(payload);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const data = parsed.data;
    return this.prisma.coupon.create({
      data: {
        code: data.code,
        description: data.description,
        discountType: data.discountType,
        discountValue: data.discountValue,
        maxUses: data.maxUses ?? null,
        validFrom: data.validFrom ?? new Date(),
        validUntil: data.validUntil ?? null,
        planId: data.planId ?? null,
        isActive: true,
      },
    });
  }

  async updateCoupon(id: string, payload: any) {
    const parsed = createCouponSchema.partial().safeParse(payload);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.prisma.coupon.update({ where: { id }, data: parsed.data });
  }

  async getCouponUsage(id: string) {
    return this.prisma.couponUsage.findMany({
      where: { couponId: id },
      include: { tenant: { select: { companyName: true } } },
    });
  }

  async validateCoupon(code: string, planId?: string) {
    const coupon = await this.prisma.coupon.findUnique({ where: { code } });
    if (!coupon || !coupon.isActive) throw new BadRequestException('Invalid coupon');
    if (coupon.validUntil && coupon.validUntil < new Date())
      throw new BadRequestException('Coupon expired');
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses)
      throw new BadRequestException('Coupon max uses reached');
    if (coupon.planId && coupon.planId !== planId)
      throw new BadRequestException('Coupon not applicable for this plan');
    return coupon;
  }
}
