import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { TimerScreen } from '@/features/timer/TimerScreen';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <TimerScreen />
    </SafeAreaProvider>
  );
}
