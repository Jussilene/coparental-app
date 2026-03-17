import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

export function PasswordField({ label, value, onChange, name, placeholder }) {
  const [visible, setVisible] = useState(false);

  return (
    <label className="field">
      <span>{label}</span>
      <div className="password-wrap">
        <input
          type={visible ? "text" : "password"}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
        />
        <button type="button" className="icon-button" onClick={() => setVisible((current) => !current)}>
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </label>
  );
}
