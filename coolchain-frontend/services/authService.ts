import { MessageDTO } from '@/helpers/types/dto/MessageDTO';
import { SignInDTO } from '@/helpers/types/dto/SignInDTO';
import { ErrorCodes } from '@/utils/errors';
import { JwtDTO } from '@/helpers/types/dto/JwtDTO';

const handleResponse = async (response: Response, errorMap: Record<number, string>, defaultError: string) => {
  if (!response.ok) {
    const errorCode = errorMap[response.status] || defaultError;
    throw new Error(errorCode);
  }
  return await response.json();
};

export const getSiweMessage = async (account: string): Promise<MessageDTO> => {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/message?address=${account}`);
  return handleResponse(response, {
    429: ErrorCodes.ERROR_TOO_MANY_REQUESTS.code,
  }, ErrorCodes.ERROR_GET_SIWE_MESSAGE.code);
};

export const signIn = async (signInDTO: SignInDTO): Promise<JwtDTO> => {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/signIn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(signInDTO),
  });
  return handleResponse(response, {
    429: ErrorCodes.ERROR_TOO_MANY_REQUESTS.code,
    408: ErrorCodes.ERROR_AUTH_TIMEOUT_EXPIRED.code,
    401: ErrorCodes.UNAUTHORIZED.code,
  }, ErrorCodes.ERROR_SIGN_IN.code);
};
