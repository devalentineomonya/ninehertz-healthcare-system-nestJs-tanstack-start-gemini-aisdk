/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Repository } from 'typeorm';
import { Appointment } from '../appointment/entities/appointment.entity';
import { User } from '../user/entities/user.entity';
interface Database {
  public: {
    Tables: {
      chats: {
        Row: {
          id: string;
          appointment_id: string;
          participants: string[];
          type: string;
          created_at: string;
          updated_at: string;
          last_message?: string;
          last_message_at?: string;
          unread_count?: number;
        };
        Insert: {
          appointment_id: string;
          participants: string[];
          type: string;
          created_at: string;
          updated_at: string;
          last_message?: string;
          last_message_at?: string;
          unread_count?: number;
        };
        Update: {
          appointment_id?: string;
          participants?: string[];
          type?: string;
          created_at?: string;
          updated_at?: string;
          last_message?: string;
          last_message_at?: string;
          unread_count?: number;
        };
        Relationships: [];
      };
      chat_participants: {
        Row: {
          chat_id: string;
          user_id: string;
          joined_at: string;
        };
        Insert: {
          chat_id: string;
          user_id: string;
          joined_at: string;
        };
        Update: {
          chat_id?: string;
          user_id?: string;
          joined_at?: string;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          chat_id: string;
          sender_id: string;
          content: string;
          message_type: string;
          read_by: string[];
        };
        Insert: {
          chat_id: string;
          sender_id: string;
          content: string;
          message_type: string;
          read_by: string[];
        };
        Update: {
          chat_id?: string;
          sender_id?: string;
          content?: string;
          message_type?: string;
          read_by?: string[];
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

@Injectable()
export class MessagingService {
  private supabase: SupabaseClient<Database, 'public'>;

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Appointment)
    private appointmentRepository: Repository<Appointment>,
    private readonly configService: ConfigService,
  ) {
    this.supabase = createClient<Database, 'public'>(
      this.configService.getOrThrow<string>('SUPABASE_URL'),
      this.configService.getOrThrow<string>('SUPABASE_SERVICE_KEY'),
    );
  }

  async createChatForAppointment(
    appointmentId: string,
  ): Promise<{ chatId: string }> {
    // Fetch appointment with relations
    const appointment = await this.appointmentRepository.findOne({
      where: { id: appointmentId },
      relations: ['patient.user', 'doctor.user'],
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    const participantIds = [
      appointment.patient.user.id,
      appointment.doctor.user.id,
    ];

    // Check if chat already exists for this appointment
    const { data: existingChat } = await this.supabase
      .from('chats')
      .select('id')
      .eq('appointment_id', appointmentId)
      .single();

    if (existingChat) {
      return { chatId: existingChat.id };
    }

    // Create new chat in Supabase
    const { data: chat, error: chatError }: { data: any; error: any } =
      await this.supabase
        .from('chats')
        .insert({
          appointment_id: appointmentId,
          participants: participantIds,
          type: 'appointment',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

    if (chatError) {
      throw new BadRequestException('Failed to create chat');
    }

    // Add participants to chat_participants table
    const participantInserts = participantIds.map((userId) => ({
      chat_id: chat.id,
      user_id: userId,
      joined_at: new Date().toISOString(),
    }));

    const { error: participantsError } = await this.supabase
      .from('chat_participants')
      .insert(participantInserts);

    if (participantsError) {
      throw new BadRequestException('Failed to add chat participants');
    }

    // Send system message about appointment
    await this.supabase.from('messages').insert({
      chat_id: chat.id as string,
      sender_id: 'system',
      content: `Chat created for appointment on ${appointment.datetime.toLocaleDateString()} at ${appointment.datetime.toLocaleTimeString()}`,
      message_type: 'system',
      read_by: [],
    });

    return { chatId: chat.id };
  }

  async getUserProfile(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: [
        'patientProfile',
        'doctorProfile',
        'adminProfile',
        'pharmacistProfile',
      ],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      profilePicture: user.profilePicture,
      patientProfile: user.patientProfile
        ? {
            id: user.patientProfile.id,
            fullName: user.patientProfile.fullName,
            phoneNumber: user.patientProfile.phone,
          }
        : undefined,
      doctorProfile: user.doctorProfile
        ? {
            id: user.doctorProfile.id,
            fullName: user.doctorProfile.fullName,
            specialization: user.doctorProfile.specialty,
            phoneNumber: user.doctorProfile.licenseNumber,
          }
        : undefined,
      adminProfile: user.adminProfile
        ? {
            id: user.adminProfile.id,
            fullName: user.adminProfile.fullName,
          }
        : undefined,
      pharmacistProfile: user.pharmacistProfile
        ? {
            id: user.pharmacistProfile.id,
            fullName: user.pharmacistProfile.fullName,
          }
        : undefined,
    };
  }

  async markMessagesAsRead(chatId: string, userId: string): Promise<void> {
    // Get unread messages for this user in this chat
    const { data: messages, error: fetchError } = await this.supabase
      .from('messages')
      .select('id, read_by')
      .eq('chat_id', chatId)
      .neq('sender_id', userId);

    if (fetchError) {
      throw new BadRequestException('Failed to fetch messages');
    }

    // Filter messages that haven't been read by this user
    const unreadMessages = messages.filter(
      (msg) => Array.isArray(msg.read_by) && !msg.read_by.includes(userId),
    );

    if (unreadMessages.length === 0) {
      return;
    }

    // Update read_by array for unread messages
    const updates = unreadMessages.map((msg) => ({
      id: msg.id,
      read_by: [...msg.read_by, userId],
    }));

    const updateResults = await Promise.all(
      updates.map((update) =>
        this.supabase
          .from('messages')
          .update({ read_by: update.read_by })
          .eq('id', update.id),
      ),
    );

    const updateError = updateResults.find((result) => result.error)?.error;

    if (updateError) {
      throw new BadRequestException('Failed to mark messages as read');
    }

    // Update unread count in chat
    await this.updateUnreadCount(chatId, userId);
  }

  private async updateUnreadCount(
    chatId: string,
    userId: string,
  ): Promise<void> {
    // Count unread messages for this user
    const { count, error } = await this.supabase
      .from('messages')
      .select('id', { count: 'exact' })
      .eq('chat_id', chatId)
      .neq('sender_id', userId)
      .not('read_by', 'cs', `{${userId}}`);

    if (error) {
      console.error('Failed to count unread messages:', error);
      return;
    }

    // Update chat's unread count
    await this.supabase
      .from('chats')
      .update({ unread_count: count || 0 })
      .eq('id', chatId);
  }

  async getChatsByUser(userId: string) {
    const { data: chats, error } = await this.supabase
      .from('chats')
      .select('*')
      .contains('participants', [userId])
      .order('last_message_at', { ascending: false });

    if (error) {
      throw new BadRequestException('Failed to fetch chats');
    }

    return chats;
  }

  async sendAppointmentReminder(
    appointmentId: string,
    reminderText: string,
  ): Promise<void> {
    // Get chat for appointment
    const { data: chat, error: chatError } = await this.supabase
      .from('chats')
      .select('id')
      .eq('appointment_id', appointmentId)
      .single();

    if (chatError || !chat) {
      console.error('No chat found for appointment:', appointmentId);
      return;
    }

    // Send reminder message
    await this.supabase.from('messages').insert({
      chat_id: chat.id,
      sender_id: 'system',
      content: reminderText,
      message_type: 'appointment_reminder',
      read_by: [],
    });

    // Update chat's last message
    await this.supabase
      .from('chats')
      .update({
        last_message: reminderText,
        last_message_at: new Date().toISOString(),
      })
      .eq('id', chat.id);
  }
}
