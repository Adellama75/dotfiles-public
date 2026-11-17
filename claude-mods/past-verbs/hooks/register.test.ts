import { expect, test } from 'claude-code/testing'

import { PAST, pick } from './register'

test('a line keeps its word, and the word is one of the list', async () => {
  for (const id of ['a', 'msg_01', 'msg_02', '']) {
    expect(PAST.includes(pick(id))).toBe(true)
    expect(pick(id)).toBe(pick(id))
  }
})

// Claude
