import { BrevoClient, BrevoError } from '@getbrevo/brevo';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  appointmentCancelledEmail,
  appointmentCreatedEmail,
  appointmentReminderEmail,
  prescriptionEmail,
} from './templates/appointment.templates';
import {
  otpEmail,
  otpEmailProps,
  ResetPasswordEmail,
} from './templates/mail.templates';
import { orderEmail } from './templates/order-email';

@Injectable()
export class MailService {
  private readonly brevo: BrevoClient;
  private readonly logger = new Logger(MailService.name);
  private readonly senderEmail: string;
  private readonly senderName: string;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.getOrThrow<string>('BREVO_API_KEY');
    this.senderEmail = this.configService.getOrThrow<string>('MAIL_USER');
    this.senderName =
      this.configService.get<string>('MAIL_SENDER_NAME') ||
      'NineHertz Medic - Your Health Our Pride';

    this.brevo = new BrevoClient({
      apiKey,
      timeoutInSeconds: 30,
      maxRetries: 2,
    });
  }

  async sendOTPCode(
    to: string,
    props: otpEmailProps,
  ): Promise<{ messageId?: string }> {
    const html = otpEmail({ ...props });
    this.logger.debug(`Sending OTP email to ${to}`);
    return this.sendEmail(to, 'Your MFA Code', html);
  }

  async sendResetPasswordEmail(
    to: string,
    resetLink: string,
  ): Promise<{ messageId?: string }> {
    const html = ResetPasswordEmail({ resetLink });
    this.logger.debug(`Sending reset password email to ${to}`);
    return this.sendEmail(to, 'Reset Your Password', html);
  }

  private async sendEmail(
    to: string,
    subject: string,
    html: string,
  ): Promise<{ messageId?: string }> {
    try {
      const response = await this.brevo.transactionalEmails.sendTransacEmail({
        to: [{ email: to }],
        sender: {
          email: this.senderEmail,
          name: this.senderName,
        },
        subject,
        htmlContent: html,
      });

      this.logger.log(
        `Email sent successfully to ${to}. Message ID: ${response.messageId}`,
      );
      return { messageId: response.messageId };
    } catch (error) {
      if (error instanceof BrevoError) {
        this.logger.error(
          `Failed to send email to ${to}: [${error.statusCode}] ${error.message}`,
        );
        throw new Error(`Email sending failed: ${error.message}`);
      }
      this.logger.error(`Failed to send email to ${to}:`, error);
      throw new Error(
        `Email sending failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async sendAppointmentCreated(
    to: string,
    props: {
      patientName: string;
      doctorName: string;
      appointmentTime: string;
      meetingLink?: string;
    },
  ): Promise<{ messageId?: string }> {
    const html = appointmentCreatedEmail(props);
    return this.sendEmail(to, 'Your Appointment is Confirmed', html);
  }

  async sendAppointmentReminder(
    to: string,
    props: {
      patientName: string;
      doctorName: string;
      appointmentTime: string;
      meetingLink?: string;
    },
  ): Promise<{ messageId?: string }> {
    const html = appointmentReminderEmail(props);
    return this.sendEmail(to, 'Appointment Reminder', html);
  }

  async sendAppointmentCancelled(
    email: string,
    data: {
      patientName: string;
      doctorName: string;
      appointmentTime: string;
      reason: string;
      refundMessage?: string;
      isDoctor?: boolean;
    },
  ): Promise<void> {
    const html = appointmentCancelledEmail({
      ...data,
      companyName: 'NineHertz Medic',
    });

    await this.sendEmail(
      email,
      data.isDoctor
        ? 'Appointment Cancellation Notification'
        : 'Your Appointment Has Been Cancelled',
      html,
    );
  }

  async sendPrescriptionEmail(
    email: string,
    data: {
      patientName: string;
      doctorName: string;
      items: Array<{
        name: string;
        dosage: string;
        frequency: string;
        instructions?: string;
      }>;
      issueDate: string;
      expiryDate: string;
      action: 'created' | 'updated' | 'fulfilled';
    },
  ) {
    const html = prescriptionEmail({
      patientName: data.patientName,
      doctorName: data.doctorName,
      items: data.items,
      issueDate: data.issueDate,
      expiryDate: data.expiryDate,
      action: data.action,
    });

    await this.sendEmail(
      email,
      `Prescription ${data.action === 'created' ? 'Created' : data.action === 'updated' ? 'Updated' : 'Fulfilled'}`,
      html,
    );
  }

  async sendOrderEmail(email: string, data: Parameters<typeof orderEmail>[0]) {
    const html = orderEmail(data);

    await this.sendEmail(
      email,
      data.action
        ? `Order ${data.action.charAt(0).toUpperCase() + data.action.slice(1)}`
        : 'Order Update',
      html,
    );
  }
}
