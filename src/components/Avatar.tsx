interface AvatarProps {
  src: string | null
  name: string
  size?: number
}

const COLORS = [
  '#6c5ce7', '#00b894', '#e17055', '#0984e3',
  '#d63031', '#fdcb6e', '#e84393', '#00cec9',
]

function hashColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return COLORS[Math.abs(h) % COLORS.length]
}

export default function Avatar({ src, name, size = 40 }: AvatarProps) {
  const style = { width: size, height: size, fontSize: size * 0.42 }
  if (src) {
    return (
      <div className="avatar" style={style}>
        <img src={src} alt={name} width={size} height={size} />
      </div>
    )
  }
  return (
    <div
      className="avatar"
      style={{ ...style, background: hashColor(name) }}
      aria-label={name}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
}
