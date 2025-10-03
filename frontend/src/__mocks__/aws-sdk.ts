// Mock AWS SDK for testing
export const CognitoIdentityProviderClient = jest.fn().mockImplementation(() => ({
  send: jest.fn(),
}));

export const GetUserCommand = jest.fn().mockImplementation(() => ({}));

export const mockCognitoClient = {
  send: jest.fn(),
};

export default {
  CognitoIdentityProviderClient,
  GetUserCommand,
};