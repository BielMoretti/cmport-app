// Entrada do aplicativo. As telas continuam vindo do Expo Router; a única coisa a mais é
// registrar o widget da tela inicial do Android, que roda mesmo com o aplicativo fechado.
import 'expo-router/entry';

import { registrarWidget } from './src/widget/registrar';

registrarWidget();
