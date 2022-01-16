import React, { useContext, useRef, useState } from "react";
import { Message, Portal, Transition } from "semantic-ui-react";
import "./Alert.css";

const AlertContext = React.createContext<{ appendMessage: (header: string, content: string, type?: AlertType, timeout?: number) => void }>({ appendMessage: () => undefined });

type AlertType = "default" | "info" | "success" | "warning" | "error";

interface AlertMessageData {
  id: number;
  type?: AlertType;
  header: string;
  content: string;
  timeoutId: NodeJS.Timeout | undefined;
}

function useAlert() {
  const nextId = useRef<number>(1);
  const [messages, setMessages] = useState<AlertMessageData[]>([]);

  const onDismiss = (id: number) => {
    setMessages((prevMessages) => prevMessages.filter((message) => message.id !== id));
  };

  const appendMessage = (header: string, content: string, type?: AlertType, timeout?: number) => {
    setMessages((prevMessages) => {
      const newMessageId = nextId.current++;
      const newMessageData: AlertMessageData = {
        id: newMessageId,
        type,
        header,
        content,
        timeoutId: timeout && timeout > 0 ? setTimeout(() => onDismiss(newMessageId), timeout) : undefined,
      };
      return [...prevMessages, newMessageData];
    });
  };

  return {
    messages,
    onDismiss,
    appendMessage,
  };
}

const typeIconMap = {
  default: "alarm",
  info: "info",
  success: "check",
  warning: "exclamation",
  error: "times",
};

function Alert({ messages, onDismiss }: { messages: AlertMessageData[]; onDismiss: (id: number) => void }) {
  return (
    <Portal open={true}>
      <div className="ui-alert">
        <Transition.Group animation="fly left">
          {messages.map((message) => (
            <div key={message.id}>
              <Message
                info={message.type === "info"}
                success={message.type === "success"}
                warning={message.type === "warning"}
                error={message.type === "error"}
                icon={typeIconMap[message.type || "default"]}
                header={message.header}
                content={message.content}
                size="mini"
                onDismiss={() => onDismiss(message.id)}
              />
            </div>
          ))}
        </Transition.Group>
      </div>
    </Portal>
  );
}

export function AlertProvider(props: { children: React.ReactNode }) {
  const { messages, onDismiss, appendMessage } = useAlert();
  return (
    <AlertContext.Provider value={{ appendMessage }}>
      {props.children}
      <Alert messages={messages} onDismiss={onDismiss} />
    </AlertContext.Provider>
  );
}

export function useAlertContext() {
  return useContext(AlertContext);
}
