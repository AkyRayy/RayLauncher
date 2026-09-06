export class DatabaseSync {
  constructor() {
    throw new Error('node:sqlite недоступен в тестовой среде: тест не должен открывать базу')
  }
}

export class StatementSync {}
