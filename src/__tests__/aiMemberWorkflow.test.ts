import type { Dispatch, SetStateAction } from 'react'
import {
  createAiMemberWorkflow,
  type AiMemberWorkflowDependencies
} from '../renderer/views/AI/aiMemberWorkflow'
import type {
  AiMemberImportState,
  AiMemberUpdateChange,
  AiMemberUpdateState,
  MemberRow
} from '../renderer/views/AI/aiViewTypes'
import { dispatchDataChanged } from '../renderer/utils/refresh'

jest.mock('../renderer/utils/refresh', () => ({ dispatchDataChanged: jest.fn() }))

function stateCell<T>(initial: T) {
  let value = initial
  const set: Dispatch<SetStateAction<T>> = (next) => {
    value = typeof next === 'function' ? (next as (previous: T) => T)(value) : next
  }
  return { get: () => value, set }
}

function harness(initial?: AiMemberImportState, updates?: AiMemberUpdateState) {
  const creation = stateCell<AiMemberImportState | null>(initial || null)
  const editing = stateCell<AiMemberUpdateState | null>(updates || null)
  const members = {
    list: jest
      .fn<
        ReturnType<AiMemberWorkflowDependencies['members']['list']>,
        Parameters<AiMemberWorkflowDependencies['members']['list']>
      >()
      .mockResolvedValue({ rows: [], total: 0 }),
    create: jest
      .fn<
        ReturnType<AiMemberWorkflowDependencies['members']['create']>,
        Parameters<AiMemberWorkflowDependencies['members']['create']>
      >()
      .mockResolvedValue({ id: 12 }),
    update: jest
      .fn<
        ReturnType<AiMemberWorkflowDependencies['members']['update']>,
        Parameters<AiMemberWorkflowDependencies['members']['update']>
      >()
      .mockResolvedValue({ id: 1 })
  }
  const pushMessage = jest.fn()
  const notify = jest.fn()
  const setBusy = jest.fn()
  const render = () =>
    createAiMemberWorkflow({
      members,
      pushMessage,
      notify,
      setBusy,
      pendingMembers: creation.get(),
      setPendingMembers: creation.set,
      pendingMemberUpdates: editing.get(),
      setPendingMemberUpdates: editing.set
    })
  return { members, creation, editing, pushMessage, notify, setBusy, render }
}

const draft: AiMemberImportState = {
  sourcePrompt: 'Mitglied anlegen',
  status: 'DRAFT',
  members: [
    {
      name: 'Anna Meyer',
      joinDate: '2026-01-01',
      contributionAmount: 20,
      contributionInterval: 'MONTHLY'
    }
  ]
}

const change: AiMemberUpdateChange = {
  id: '1:email',
  memberId: 1,
  memberName: 'Anna Meyer',
  field: 'email',
  label: 'E-Mail',
  oldValue: 'old@example.org',
  newValue: 'ANNA@EXAMPLE.ORG',
  oldDisplay: 'old@example.org',
  newDisplay: 'ANNA@EXAMPLE.ORG',
  selected: true
}

const review = (changes: AiMemberUpdateChange[]): AiMemberUpdateState => ({
  sourcePrompt: 'Mitglieder ändern',
  status: 'DRAFT',
  changes
})

beforeEach(() => jest.clearAllMocks())

it('prepares members, requests missing contributions and only creates after explicit confirmation', async () => {
  const h = harness()
  expect(await h.render().prepareMemberCreation('Anna Meyer, Eintritt 01.01.2026')).toBe(true)
  expect(h.creation.get()?.status).toBe('DRAFT')
  await h.render().createPendingMembers()
  expect(h.members.create).not.toHaveBeenCalled()
  expect(h.pushMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({ title: 'Mitgliederanlage noch unvollständig' })
  )

  expect(await h.render().applyMemberFollowup('20 Euro monatlich')).toBe(true)
  expect(h.creation.get()?.members[0]).toMatchObject({
    contributionAmount: 20,
    contributionInterval: 'MONTHLY'
  })
  expect(h.members.create).not.toHaveBeenCalled()
  expect(await h.render().applyMemberFollowup('Lege alle an')).toBe(true)
  expect(h.members.create).toHaveBeenCalledTimes(1)
  expect(h.creation.get()?.status).toBe('CREATED')
  await h.render().createPendingMembers()
  expect(await h.render().applyMemberFollowup('Lege alle an')).toBe(false)
  expect(h.members.create).toHaveBeenCalledTimes(1)
  expect(dispatchDataChanged).toHaveBeenCalledWith(['members'])
})

it('uses recovered drafts and preserves member numbering and creation payloads', async () => {
  const h = harness()
  h.members.list.mockResolvedValue({
    rows: [
      { id: 1, name: 'Existing', status: 'ACTIVE', createdAt: '', memberNo: '0042' },
      { id: 2, name: 'Other', status: 'ACTIVE', createdAt: '', memberNo: 'EXTERNAL' }
    ],
    total: 2
  })
  await h.render().createPendingMembers(draft)
  expect(h.members.create).toHaveBeenCalledWith({
    memberNo: '0043',
    name: 'Anna Meyer',
    status: 'ACTIVE',
    boardRole: null,
    join_date: '2026-01-01',
    contribution_amount: 20,
    contribution_interval: 'MONTHLY',
    next_due_date: null,
    notes: null
  })
  expect(h.creation.get()?.members[0]).toMatchObject({ createdId: 12, createdMemberNo: '0043' })
  expect(h.setBusy.mock.calls).toEqual([[true], [false]])
})

it('keeps the creation draft and clears busy state when the member API fails', async () => {
  const h = harness(draft)
  h.members.create.mockRejectedValue(new Error('Anlage fehlgeschlagen'))
  await h.render().createPendingMembers()
  expect(h.creation.get()).toEqual(draft)
  expect(h.notify).toHaveBeenCalledWith('error', 'Anlage fehlgeschlagen')
  expect(h.setBusy).toHaveBeenLastCalledWith(false)
  expect(dispatchDataChanged).not.toHaveBeenCalled()
})

it('loads all member pages before preparing a review and does not write during preparation', async () => {
  const h = harness()
  const rows: MemberRow[] = Array.from({ length: 201 }, (_, id) => ({
    id,
    name: `Mitglied ${id}`,
    status: 'ACTIVE',
    createdAt: '',
    contribution_amount: 10
  }))
  h.members.list
    .mockResolvedValueOnce({ rows: rows.slice(0, 200), total: 201 })
    .mockResolvedValueOnce({ rows: rows.slice(200), total: 201 })
  await h
    .render()
    .prepareMemberUpdate('Setze bei allen aktiven Mitgliedern den Beitrag auf 20 Euro monatlich')
  expect(h.members.list).toHaveBeenNthCalledWith(2, {
    limit: 200,
    offset: 200,
    status: 'ALL',
    sortBy: 'name',
    sort: 'ASC'
  })
  expect(new Set(h.editing.get()?.changes.map((item) => item.memberId)).size).toBe(201)
  expect(h.members.update).not.toHaveBeenCalled()
})

it('adjusts only unapplied review emails and contribution fields without writing', async () => {
  const amount: AiMemberUpdateChange = {
    ...change,
    id: '1:amount',
    field: 'contribution_amount',
    newValue: 10
  }
  const interval: AiMemberUpdateChange = {
    ...change,
    id: '1:interval',
    field: 'contribution_interval',
    newValue: 'YEARLY'
  }
  const h = harness(
    undefined,
    review([change, { ...change, id: '2:email', applied: true }, amount, interval])
  )
  expect(await h.render().applyMemberUpdateFollowup('E-Mail bitte klein schreiben')).toBe(true)
  expect(h.editing.get()?.changes[0].newValue).toBe('anna@example.org')
  expect(h.editing.get()?.changes[1].newValue).toBe('ANNA@EXAMPLE.ORG')
  expect(await h.render().applyMemberUpdateFollowup('30 Euro monatlich')).toBe(true)
  expect(
    h.editing
      .get()
      ?.changes.slice(2)
      .map((item) => item.newValue)
  ).toEqual([30, 'MONTHLY'])
  expect(h.members.update).not.toHaveBeenCalled()
})

it('groups selected changes per member and respects excluded and already applied changes', async () => {
  const h = harness(
    undefined,
    review([
      change,
      { ...change, id: '1:phone', field: 'phone', newValue: '12345' },
      { ...change, id: '2:email', memberId: 2 },
      { ...change, id: '3:email', memberId: 3, applied: true }
    ])
  )
  h.render().toggleMemberUpdateChange('2:email')
  h.render().toggleMemberUpdateChange('3:email')
  expect(await h.render().applyMemberUpdateFollowup('Übernehme alle Änderungen')).toBe(true)
  expect(h.members.update).toHaveBeenCalledTimes(1)
  expect(h.members.update).toHaveBeenCalledWith({
    id: 1,
    email: 'ANNA@EXAMPLE.ORG',
    phone: '12345'
  })
  expect(h.editing.get()?.changes.map((item) => item.applied)).toEqual([
    true,
    true,
    undefined,
    true
  ])
  expect(h.editing.get()?.status).toBe('APPLIED')
  await h.render().applyPendingMemberUpdates()
  expect(h.members.update).toHaveBeenCalledTimes(1)
  expect(dispatchDataChanged).toHaveBeenCalledWith(['members'])
})

it('does not write an empty selection and retains the review when an update fails', async () => {
  const h = harness(undefined, review([{ ...change, selected: false }]))
  await h.render().applyPendingMemberUpdates()
  expect(h.members.update).not.toHaveBeenCalled()
  expect(h.setBusy).not.toHaveBeenCalled()
  expect(h.notify).toHaveBeenCalledWith('info', 'Keine Mitgliederänderungen ausgewählt.')

  h.render().toggleMemberUpdateChange(change.id)
  h.members.update.mockRejectedValue(new Error('Änderung fehlgeschlagen'))
  await h.render().applyPendingMemberUpdates()
  expect(h.editing.get()?.status).toBe('DRAFT')
  expect(h.notify).toHaveBeenCalledWith('error', 'Änderung fehlgeschlagen')
  expect(h.setBusy).toHaveBeenLastCalledWith(false)
  expect(dispatchDataChanged).not.toHaveBeenCalled()
})
