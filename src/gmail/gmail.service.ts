import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Auth, google } from 'googleapis';
import { SendEmailDto } from './dto/send-email.dto';

@Injectable()
export class GmailService {
  private oAuth2Client: Auth.OAuth2Client;
  private readonly logger = new Logger('GmailService');
  private accessToken: string | null = null;

  constructor() {
    this.getOAuth2Client();
  }

  private getOAuth2Client() {
    try {
      this.oAuth2Client = new google.auth.OAuth2(
        process.env.CLIENT_ID,
        process.env.CLIENT_SECRET,
        process.env.REDIRECT_URI,
      );

      this.oAuth2Client.setCredentials({
        refresh_token: process.env.REFRESH_TOKEN,
      });

      // Obtener el token solo una vez y almacenarlo en memoria
      if (!this.accessToken) {
        this.oAuth2Client.getAccessToken((err, token) => {
          if (err || !token) {
            this.logger.error('Error al obtener el token de acceso: ', err);
            throw new UnauthorizedException('No autorizado para acceder a los correos');
          } else {
            this.accessToken = token;
            this.logger.log('Token de acceso obtenido correctamente');
          }
        });
      } else {
        this.oAuth2Client.setCredentials({ access_token: this.accessToken });
      }
    } catch (error) {
      this.logger.error('Error al configurar el cliente OAuth2:', error);
      throw new InternalServerErrorException('Error en la configuración del cliente OAuth2');
    }
  }

  async getAllEmails() {
    const gmail = google.gmail({ version: 'v1', auth: this.oAuth2Client });
  
    try {
      const response = await gmail.users.messages.list({
        userId: 'me',
      });
  
      // Verifica que la respuesta tenga datos
      if (!response.data || !response.data.messages) {
        this.logger.warn('No se encontraron mensajes en la bandeja de entrada.');
        return [];
      }
  
      const messages = response.data.messages;
      const messagesPromises = messages.map(async (message) => {
        try {
          const msg = await gmail.users.messages.get({
            userId: 'me',
            id: message.id,
          });
  
          // Verifica si la propiedad 'payload' existe
          if (msg.data.payload) {
            const headers = msg.data.payload.headers;
  
            const receivedHeader = headers.find((header) => header.name === 'Received');
            const fromHeader = headers.find((header) => header.name === 'From');
            const subjectHeader = headers.find((header) => header.name === 'Subject');
            
          
            // Si los encabezados no existen, asigna un valor predeterminado
            const received = receivedHeader ? (receivedHeader.value.split(';')[1]?.trim() || 'Fecha no disponible') : 'No disponible';
            const from = fromHeader ? fromHeader.value.trim() : 'No disponible';
            const subject = subjectHeader ? subjectHeader.value.trim() : 'Sin asunto';
  
            // Procesa el snippet
            const cleanSnippet = this.cleanMessageSnippet(msg.data.snippet);
  
            return {
              id: msg.data.id,
              snippet: cleanSnippet,
              received,
              from,
              subject,
              formatDate: this.formatDate(received),
              content: `${process.env.BASE_URL}/api/email/${msg.data.id}/html`,
            };
          }
        } catch (error) {
          this.logger.error('Error al obtener el mensaje con id ' + message.id, error);
          throw new InternalServerErrorException('Error al procesar un mensaje');
        }
      });
  
      return await Promise.all(messagesPromises);
    } catch (error) {
      this.logger.error('Error al obtener los correos:', error);
      throw new InternalServerErrorException('Error al obtener los correos');
    }
  }

  async getEmailHtml(id: string) {
    const gmail = google.gmail({ version: 'v1', auth: this.oAuth2Client });

    try {
      const msg = await gmail.users.messages.get({
        userId: 'me',
        id: id,
      });

      return this.extractMessageContent(msg.data.payload);
    } catch (error) {
      this.handleExceptions(error, id);
    }
  }

  async getEmailById(id: string) {
    const gmail = google.gmail({ version: 'v1', auth: this.oAuth2Client });

    try {
      const msg = await gmail.users.messages.get({
        userId: 'me',
        id: id,
      });

      let received = '';
      let from = '';
      let subject = '';
      if (msg.data.payload) {
        const headers = msg.data.payload.headers;
        const receivedArray = headers
          .find((header) => header.name === 'Received')
          .value.split(';')
          .map((received) => received.trim());

        received = receivedArray[1];
        from = headers.find((header) => header.name === 'From').value.trim();
        subject = headers
          .find((header) => header.name === 'Subject')
          .value.trim();
      }

      const cleanSnippet = this.cleanMessageSnippet(msg.data.snippet);

      return {
        id: msg.data.id,
        snippet: cleanSnippet,
        received,
        from,
        subject,
        formatDate: this.formatDate(received),
        content: `${process.env.BASE_URL}/api/email/${msg.data.id}/html`,
      };
    } catch (error) {
      this.handleExceptions(error, id);
    }
  }

  async sendEmail(emailData: SendEmailDto) {
    const gmail = google.gmail({ version: 'v1', auth: this.oAuth2Client });

    // Crear el contenido del email en formato RFC 822
    const utf8Subject = `=?utf-8?B?${Buffer.from(emailData.subject).toString('base64')}?=`;
    const messageParts = [
      `To: ${emailData.to}`,
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      `Subject: ${utf8Subject}`,
      '',
      emailData.message,
    ];

    const emailContent = messageParts.join('\n');

    const encodedMessage = Buffer.from(emailContent)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    try {
      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage,
          snippet: emailData.snippet || emailData.subject,
        },
      });

      return response.data;
    } catch (error) {
      this.handleExceptions(error, 'send');
      throw new InternalServerErrorException(
        'Error al enviar el email. Por favor intente más tarde.',
      );
    }
  }

  async deleteEmail(id: string) {
    const gmail = google.gmail({ version: 'v1', auth: this.oAuth2Client });

    try {
      await gmail.users.messages.trash({
        userId: 'me',
        id: id,
      });

      return {
        status: 200,
        message: 'Email eliminado correctamente',
        id,
      };
    } catch (error) {
      this.handleExceptions(error, id);
    }
  }

  private formatDate(received: string) {
    const date = new Date(received);
  
    if (isNaN(date.getTime())) {
      this.logger.warn(`Fecha inválida: ${received}`);
      // Devolver el valor original de 'received' en lugar de marcarlo como 'No disponible'
      return received; 
    }
  
    const formatter = new Intl.DateTimeFormat('es-CO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: 'America/Bogota',
    });
  
    return formatter.format(date);
  }
  
  

  private extractMessageContent(payload: any): string {
    let content = '';

    if (payload.body && payload.body.data) {
      return Buffer.from(payload.body.data, 'base64').toString();
    }

    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/html') {
          content = this.extractMessageContent(part);
          break;
        }
        if (part.mimeType === 'text/plain') {
          content = this.extractMessageContent(part);
        }
        if (part.parts) {
          content = this.extractMessageContent(part);
        }
      }
    }

    return content;
  }

  private cleanMessageSnippet(snippet: string): string {
    return snippet
      .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Eliminar emojis y caracteres especiales
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Normalizar caracteres acentuados
      .replace(
        /[\u200B-\u200D\uFEFF\u0020\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]/g,
        ' ',
      ) // Eliminar caracteres invisibles
      .replace(
        /[\u0000-\u001F\u007F-\u009F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g,
        '', // Eliminar caracteres de control
      )
      .replace(/\s*\.\s*/g, '. ') // Normalizar espacios alrededor de puntos
      .replace(/\s+/g, ' ') // Convertir múltiples espacios en uno solo
      .replace(/\s+\./g, '.') // Eliminar espacios antes de puntos
      .replace(/\.\s+/g, '. ') // Normalizar espacios después de puntos
      .trim()
      .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, ''); // Mantener solo caracteres imprimibles básicos
  }

  private handleExceptions(error: any, id: string) {
    if (error.code === 400) {
      throw new NotFoundException(`Mail with id '${id}' does not exist.`);
    }

    if (error?.response?.data?.error?.message) {
      throw new BadRequestException(error.response.data.error.message);
    }

    this.logger.error('Error al procesar el correo:', error);
    throw new InternalServerErrorException('Error al obtener o procesar el correo');
  }
}
