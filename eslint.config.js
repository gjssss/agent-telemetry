import antfu from '@antfu/eslint-config'

export default antfu({
  react: true,
  typescript: true,
}, {
  rules: {
    'no-console': 'off',
  },
})
