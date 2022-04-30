import { nanoid } from "nanoid";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button, Container, Grid, Icon, Image, Input, InputOnChangeData } from "semantic-ui-react";
import { adjectives, animals, colors, Config as NamesConfig, uniqueNamesGenerator } from "unique-names-generator";
import { useSoundsHelper } from "../soundsHelper";
import storage from "../storage";
import { soundsHelper } from "./Game";
import LangSelector from "./LangSelector";

const namesConfig: NamesConfig = {
  dictionaries: [adjectives, colors, animals],
  separator: "",
  style: "capital",
};

interface LoginProps {
  onLogin: (customId: string, userName: string, avatar: string) => void;
}

function Login({ onLogin }: LoginProps) {
  const { t, ready } = useTranslation();
  const [defaultUserName, setDefaultUserName] = useState<string>(storage.getItem("username") || "");
  const [userName, setUserName] = useState<string>(defaultUserName);
  const [customId, setCustomId] = useState<string>(storage.getItem("uuid") || "");
  const [avatar, setAvatar] = useState<string>(storage.getItem("avatar") || "");
  const { isMuted, toggleMuted } = useSoundsHelper(soundsHelper);
  const [avatarHistory, setAvatarHistory] = useState<string[]>(avatar ? [avatar] : []);
  const [avatarHistoryIndex, setAvatarHistoryIndex] = useState<number>(avatarHistory.length ? 0 : -1);

  const randomCustomId = () => {
    const newCustomId = nanoid();
    storage.setItem("uuid", newCustomId);
    setCustomId(newCustomId);
  };

  const randomUserName = () => {
    const newUserName = uniqueNamesGenerator(namesConfig);
    storage.setItem("username", newUserName);
    setDefaultUserName(newUserName);
  };

  const nextAvatar = () => {
    setAvatarHistoryIndex((prevAvatarHistoryIndex) => prevAvatarHistoryIndex + 1);
  };

  const prevAvatar = () => {
    setAvatarHistoryIndex((prevAvatarHistoryIndex) => Math.max(0, prevAvatarHistoryIndex - 1));
  };

  const onUserNameChange = (event: React.ChangeEvent, data: InputOnChangeData) => {
    const newUserName = data.value.trim();
    storage.setItem("username", newUserName || defaultUserName);
    setUserName(newUserName);
  };

  useEffect(() => {
    if (!defaultUserName) {
      randomUserName();
    }

    if (!customId) {
      randomCustomId();
    }

    if (!avatar) {
      nextAvatar();
    }
  }, []);

  useEffect(() => {
    if (avatarHistory[avatarHistoryIndex]) {
      const newAvatar = avatarHistory[avatarHistoryIndex];
      storage.setItem("avatar", newAvatar);
      setAvatar(newAvatar);
    } else {
      //const newAvatar = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(multiavatar(nanoid()))))}`;
      const newAvatar =
        process.env.NODE_ENV === "production" && process.env.REACT_APP_GET_AVATARS_FROM === "sameOrigin"
          ? `${process.env.PUBLIC_URL}/avatar/${nanoid()}`
          : `https://api.multiavatar.com/${nanoid()}.svg`;
      const index = avatarHistoryIndex;
      setAvatarHistory((prevAvatarHistory) => {
        const newAvatarHistory = prevAvatarHistory.concat();
        newAvatarHistory[index] = newAvatar;
        return newAvatarHistory;
      });
    }
  }, [avatarHistoryIndex, avatarHistory]);

  if (!ready) {
    return null;
  }

  return (
    <Container>
      <Grid padded>
        <Grid.Row columns={2}>
          <Grid.Column width={13}>
            <Button as={Link} to="/" basic>
              <Icon name="home" />
              {t("gameHomeButton")}
            </Button>
            <LangSelector />
          </Grid.Column>
          <Grid.Column width={3} textAlign="right">
            <Button icon={isMuted ? "volume off" : "volume up"} active={false} basic onClick={toggleMuted} />
          </Grid.Column>
        </Grid.Row>
        <Grid.Row textAlign="center">
          <Grid.Column>
            <Button icon="angle left" as="a" compact onClick={prevAvatar} disabled={avatarHistoryIndex <= 0} />
            <Button as="a" compact onClick={nextAvatar}>
              <Image src={avatar} size="tiny" />
            </Button>
            <Button icon="angle right" as="a" compact onClick={nextAvatar} />
          </Grid.Column>
        </Grid.Row>
        <Grid.Row textAlign="center">
          <Grid.Column>
            <Input placeholder={defaultUserName} value={userName} fluid action={{ icon: "undo", disabled: !!userName, onClick: randomUserName }} onChange={onUserNameChange} maxLength={50} />
          </Grid.Column>
        </Grid.Row>
        <Grid.Row textAlign="center">
          <Grid.Column>
            <Button onClick={() => onLogin(customId, userName || defaultUserName, avatar)} primary>
              {t("gameLoginButton")}
              <Icon name="arrow right" />
            </Button>
          </Grid.Column>
        </Grid.Row>
      </Grid>
    </Container>
  );
}

export default Login;
