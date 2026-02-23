import Stripe from 'stripe';
import { TransactionStatus } from './entities/transaction.entity';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import axios from 'axios';

interface StripeJwtPayload {
  reference: string;
  amount: number;
  userId: string;
  orderId?: string;
  appointmentId?: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class StripeService {
  private stripe: Stripe;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    this.stripe = new Stripe(
      this.configService.getOrThrow('STRIPE_SECRET_KEY'),
      {
        apiVersion: '2025-08-27.basil',
      },
    );
  }

  /** Initialize transaction and return checkout URL with JWT token */
  async initializeTransaction(paymentData: {
    amount: number;
    currency: string;
    description: string;
    successUrl: string;
    cancelUrl: string;
    email: string;
    reference: string;
    userId: string;
    orderId?: string;
    appointmentId?: string;
    metadata?: Record<string, any>;
  }): Promise<{ checkoutUrl: string; sessionId: string }> {
    try {
      let unitAmount = paymentData.amount;

      if (paymentData.currency.toLowerCase() === 'usd') {
        const exchangeRate = await this.getUsdKesExchangeRate();
        unitAmount = Math.round(paymentData.amount / exchangeRate);
      }

      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        success_url: this.buildSuccessUrlWithToken(paymentData),
        cancel_url: paymentData.cancelUrl,
        customer_email: paymentData.email,
        line_items: [
          {
            price_data: {
              currency: paymentData.currency,
              product_data: { name: paymentData.description },
              unit_amount: unitAmount,
            },
            quantity: 1,
          },
        ],
        metadata: {
          ...paymentData.metadata,
          reference: paymentData.reference,
          userId: paymentData.userId,
          orderId: paymentData.orderId || '',
          appointmentId: paymentData.appointmentId || '',
        },
      });

      if (!session.url) {
        throw new InternalServerErrorException(
          'Failed to get Stripe checkout URL',
        );
      }
      console.log(session);
      return { checkoutUrl: session.url, sessionId: session.id };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to create checkout session';
      throw new InternalServerErrorException(
        `Stripe transaction init failed: ${message}`,
      );
    }
  }

  /** Verify payment using JWT token from callback */
  async verifyPaymentWithToken(sessionId: string): Promise<{
    id: string;
    status: TransactionStatus;
    response: Stripe.Checkout.Session;
  }> {
    try {
      // Retrieve the session from Stripe to verify its current status
      const session = await this.stripe.checkout.sessions.retrieve(sessionId);

      const success = session.payment_status === 'paid';

      return {
        id: session.id,
        status: success ? TransactionStatus.SUCCESS : TransactionStatus.FAILED,
        response: session,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to verify payment';
      throw new InternalServerErrorException(
        `Stripe verification failed: ${message}`,
      );
    }
  }

  /** Legacy verify payment method using session ID (kept for backward compatibility) */
  async verifyPayment(sessionId: string): Promise<{
    id: string;
    status: TransactionStatus;
    response: Stripe.Checkout.Session;
  }> {
    try {
      const session = await this.stripe.checkout.sessions.retrieve(sessionId);
      const success = session.payment_status === 'paid';

      return {
        id: session.id,
        status: success ? TransactionStatus.SUCCESS : TransactionStatus.FAILED,
        response: session,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to verify payment';
      throw new InternalServerErrorException(
        `Stripe verification failed: ${message}`,
      );
    }
  }

  /** Refund a completed charge */
  async createRefund(chargeId: string) {
    try {
      return await this.stripe.refunds.create({ charge: chargeId });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Process refund';
      throw new InternalServerErrorException(
        `Stripe refund failed: ${message}`,
      );
    }
  }

  /** Build success URL with JWT token containing transaction data */
  private buildSuccessUrlWithToken(paymentData: {
    successUrl: string;
    reference: string;
    amount: number;
    userId: string;
    orderId?: string;
    appointmentId?: string;
  }): string {
    // Note: We'll use a placeholder for sessionId since it's not available yet
    // The actual sessionId will be appended by Stripe as a URL parameter
    const tokenPayload: Omit<StripeJwtPayload, 'sessionId'> = {
      reference: paymentData.reference,
      amount: paymentData.amount,
      userId: paymentData.userId,
      orderId: paymentData.orderId,
      appointmentId: paymentData.appointmentId,
    };

    const token = this.jwtService.sign(tokenPayload, {
      secret: this.configService.getOrThrow('PAYMENT_JWT_SECRET'),
      expiresIn: '1h', // Token valid for 1 hour
    });

    // Build the success URL with the token
    const url = new URL(paymentData.successUrl);
    url.searchParams.set('token', token);
    url.searchParams.set('session_id', '{CHECKOUT_SESSION_ID}');

    return url.toString();
  }

  /** Create a complete JWT token with session ID (used after session creation) */
  createVerificationToken(paymentData: {
    reference: string;
    amount: number;
    userId: string;
    orderId?: string;
    appointmentId?: string;
  }): string {
    const tokenPayload: StripeJwtPayload = {
      reference: paymentData.reference,
      amount: paymentData.amount,
      userId: paymentData.userId,
      orderId: paymentData.orderId,
      appointmentId: paymentData.appointmentId,
    };

    return this.jwtService.sign(tokenPayload, {
      secret: this.configService.getOrThrow('PAYMENT_JWT_SECRET'),
      expiresIn: '14d',
    });
  }

  private async getUsdKesExchangeRate(): Promise<number> {
    try {
      const response = await axios.get<{ rates: { KES: number } }>(
        'https://api.exchangerate-api.com/v4/latest/USD',
      );
      return response.data.rates.KES;
    } catch {
      throw new InternalServerErrorException('Failed to get exchange rate');
    }
  }
}
