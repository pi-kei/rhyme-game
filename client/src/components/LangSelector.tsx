import { SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import { Dropdown, DropdownProps } from "semantic-ui-react";

const langOptions = [
  { key: "en", value: "en", text: "English" },
  { key: "ru", value: "ru", text: "Русский" },
];

function LangSelector() {
  const { i18n, ready } = useTranslation();
  const onChange = (event: SyntheticEvent, data: DropdownProps) => {
    i18n.changeLanguage(String(data.value));
  };

  if (!ready) {
    return null;
  }

  return <Dropdown button className="icon" labeled icon="world" options={langOptions} text={i18n.language} defaultValue={i18n.language} basic onChange={onChange} />;
}

export default LangSelector;
