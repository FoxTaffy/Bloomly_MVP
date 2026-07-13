import { useState } from 'react';
import { TextInput, TextInputProps, View } from 'react-native';
import type { ReactNode } from 'react';

interface AuthInputProps extends TextInputProps {
  icon: ReactNode;
  rightElement?: ReactNode;
}

export function AuthInput({ icon, rightElement, style, ...rest }: AuthInputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View
      className="flex-row items-center rounded-2xl border px-4"
      style={{
        borderColor: focused ? 'rgba(76,103,207,0.6)' : 'rgba(255,255,255,0.08)',
        backgroundColor: focused ? 'rgba(76,103,207,0.07)' : 'rgba(255,255,255,0.04)',
      }}
    >
      {icon}
      <TextInput
        placeholderTextColor="rgba(255,255,255,0.2)"
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
        className="ml-3 flex-1 font-nunito-semibold text-[14px] text-white"
        style={[{ paddingVertical: 14 }, style]}
        {...rest}
      />
      {rightElement}
    </View>
  );
}
